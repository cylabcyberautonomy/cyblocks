#template for PentestGPT agent. Behaviour and skills comes from the connected Parameter's instructions
#instruction/parameter (laoded by the mapper)
#Writeback uses the tree-op grammar our DataFile uses. 
#The API key is read from an env var whose NAME is in the apiKey property
#each time this module is reached we open a new session and giev it contexta and the current state of the attack. 
#The LLM is expected to return a set of updates to the PTT, which we apply to the shared data structure.

import os, json, urllib.request #we need os so we can read the API key from the env var, json to parse the API response, and urllib to make the HTTP request
#the api speaks json so we need to encode the prompt as json and decode the response as json
from .block import Block
import ssl, certifi

#Dotenv is a library that manages environment variables for applications. It reads key-value pairs
# from a .env file and loads them into the application's environment, allowing for configuration 
#settings to be stored separately from the code
try: 
    from dotenv import load_dotenv          # rather than hardcoding the API key in the code, we read it from a .env file for security
except ImportError: # if not installed, we define a no-op load_dotenv so the code still runs, but the user must set the env var manually
    load_dotenv = lambda *a, **k: None

class LLM(Block):
    def run(self, data_stack):
        df = data_stack.peek()
        if getattr(df, "format", "ptt") == "text":# since we have more data types we nee dto pass taht to LLM to know how it can deal with data now 
            return self._run_text(data_stack, df)  #new way of reposnding and orgnizing data       
        instruction = self.properties.get("instruction", "")#to decide which mode of agent we are using
        prompt = f"{instruction}\n\nCurrent task tree:\n{df.render()}"
        note = df.take_human_note()
        if note:
            print(f"[reasoning] human {note['kind']}: {note['text']}")
        prompt += self._render_human_note(note)
        reply = self._call_api(prompt)
        task_id, tool, args = self._parse_task_command(reply)
        if tool:
            # Generation-style reply (TASK:/TOOL:/ARGS:): build+validate the command through the
            # same Choice/Action pipeline ReasonAct uses, instead of trusting a hand-written
            # tree-op command string. Parsing/Reasoning replies have no TOOL: line and never hit
            # this branch -- they fall straight through to _apply_updates below, unchanged.
            if task_id:
                try:
                    df.set_status(task_id, "doing")
                except ValueError as e:
                    print(f"[LLM] warning: {e}")
            self.dispatch_choice(data_stack, tool, args, task_id=task_id)
            print(f"[LLM] dispatched {tool} for task {task_id}")
        else:
            self._apply_updates(df, reply) # The LLM reply is expected to be in a specific format that indicates what tasks to add, what statuses to update, and what the goal is
            # The agent itself decides whether the goal is reached from the PTT it just updated
            # (set via "STATUS g1 | done" in its reply) and routes straight to the done edge --
            # there is no separate Condition block making this call.
            self._label = "done" if df.goal_reached() else "next"
            print(df.render())

    # A pending Reviewer note (override/suggest) is framed differently depending on which one it
    # was: override points at a specific problem without necessarily knowing the fix, so the
    # agent is told to figure out what changes; suggest is broader strategic guidance, so the
    # agent is told to reconsider its whole plan in light of it. By the time this note exists,
    # the graph has already routed straight to the Reasoning agent, so whichever LLM calls this
    # is the one meant to act on it.
    def _render_human_note(self, note):
        if not note:
            return ""
        if note["kind"] == "override":
            return (f"\n\nHuman override -- they flagged something specific that needs to change "
                     f"(they may not know exactly what the fix should be): {note['text']}\n"
                     f"Determine what needs to change and revise the tree accordingly.")
        return (f"\n\nHuman suggestion -- general guidance for your overall strategy: {note['text']}\n"
                f"Reconsider your current plan, taking this into account.")

    # ptt-mode Generation replies use TASK:/TOOL:/ARGS: instead of ADD/STATUS tree-ops -- this
    # only matches that shape; a plain tree-op reply (Parsing/Reasoning) has no TOOL: line, so
    # tool stays empty and run() falls back to _apply_updates.
    def _parse_task_command(self, reply):
        task_id, tool, args = None, "", ""
        for line in reply.splitlines():
            s = line.strip()
            if s.upper().startswith("TASK:"):
                task_id = s[5:].strip()
            elif s.upper().startswith("TOOL:"):
                tool = s[5:].strip()
            elif s.upper().startswith("ARGS:"):
                args = s[5:].strip()
        return task_id, tool, args


    def _run_text(self, data_stack, df):
        prompt = self.properties.get("instruction", "")#our parameters 
        transcript = df.render_tail(12)
        reply = self._call_api(prompt, transcript)
        tool, args = self._parse_reply(reply)
        if tool == "record":#recored each run 
            df.add_finding(args)
            df.append("llm", f"RECORD: {args}")
            print(f"[FOUND] {args}", flush=True)
            return                                  # no command to send to executor 
        if tool == "done":
            df.append("llm", "DONE")
            df.done = True
            print("[AGENT] DONE", flush=True)
            print("[FINDINGS]\n" + df.render_findings(), flush=True)   # the end of attack report(transcropt)
        else:
            df.append("llm", f"TOOL: {tool}\nARGS: {args}")# a command we want to run 
            print(f"[RUN] {tool} {args}", flush=True)
        self.dispatch_choice(data_stack, tool, args)#sets self._label (done/next) that control() routes  depending on it 

        #redas the LLm reply and parse it to get one action out of the reply 
    def _parse_reply(self, reply):
        tool, args = "", ""
        for line in reply.splitlines():
            s = line.strip()
            if s.upper().startswith("DONE:"):
                return "done", ""
            if s.upper().startswith("RECORD:"):
                return "record", s[7:].strip()   # everything after RECORD is the finding
            if s.upper().startswith("TOOL:"):
                tool = s[5:].strip()
            elif s.upper().startswith("ARGS:"):
                args = s[5:].strip()
        return tool, args

 #becsue our agent can have different  control handels so it need to decide which one to route control to  
# depending on what dispatch choice choose as self label we detrmind which blcokw e are giving control to 
    def control(self, control_queue, edges):
        from ..runtime import resolve
        by_id = {b.id: b for b in control_queue.all_blocks}
        label = getattr(self, "_label", "next")
        nxt = resolve(self, label, by_id, edges)
        if nxt is None:
            nxt = resolve(self, "next", by_id, edges)   # fallback
        if nxt:
            control_queue.add(nxt)

    # which provider owns a model name, when the block doesn't say so itself (older exported
    # attacks compiled before the "provider" property existed never set it)
    def _guess_provider(self, model):
        m = (model or "").lower()
        if m.startswith(("gpt", "o1", "o3", "o4")):
            return "openai"
        if m.startswith("gemini"):
            return "google"
        return "anthropic"

    def _call_api(self, prompt, transcript=None):#this is the function that actually calls the API and returns the response. It uses urllib to make a POST request to whichever provider this block is set to
        load_dotenv()                                        # read .env into os.environ
        model = self.properties.get("model", "claude-sonnet-4-6") # in future we could use different models for different agents, but for now we are just using one model
        provider = (self.properties.get("provider") or "").strip().lower() or self._guess_provider(model)
        default_key_env = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY", "google": "GOOGLE_API_KEY"}
        key_env = self.properties.get("apiKey") or default_key_env.get(provider, "ANTHROPIC_API_KEY")  # the VAR NAME we're reading from -- any key you've put in your .env
        api_key = os.environ.get(key_env, "")
        if not api_key:                                      # fail clearly, not with a cryptic HTTP error
            raise RuntimeError(f"No API key: env var {key_env!r} is not set (check your .env)")
        content = prompt if not transcript else f"{prompt}\n\n{transcript}"
        ctx = ssl.create_default_context(cafile=certifi.where())
        if provider == "openai":
            return self._call_openai(model, api_key, content, ctx)
        if provider == "google":
            return self._call_google(model, api_key, content, ctx)
        return self._call_anthropic(model, api_key, content, ctx)

    def _call_anthropic(self, model, api_key, content, ctx):
        body = json.dumps({"model": model, "max_tokens": 4096,
                           "messages": [{"role": "user", "content": content}]}).encode()# since urllib doesn't do json automatically, we have to encode the prompt as json and then encode it as bytes. The API expects a JSON payload with the model, max_tokens, and messages fields
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
            headers={"content-type": "application/json", "x-api-key": api_key,
                     "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return json.loads(resp.read())["content"][0]["text"]# we get the response as a JSON object and then extract the text from the first message in the content array

    def _call_openai(self, model, api_key, content, ctx):
        body = json.dumps({"model": model, "max_tokens": 4096,
                           "messages": [{"role": "user", "content": content}]}).encode()
        req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
            headers={"content-type": "application/json", "authorization": f"Bearer {api_key}"})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return json.loads(resp.read())["choices"][0]["message"]["content"]

    def _call_google(self, model, api_key, content, ctx):
        body = json.dumps({"contents": [{"parts": [{"text": content}]}]}).encode()
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
        req = urllib.request.Request(url, data=body,
            headers={"content-type": "application/json", "x-goog-api-key": api_key})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            return json.loads(resp.read())["candidates"][0]["content"]["parts"][0]["text"]

#our paramester instructions alraedy return tasks with specific words, but our PTT does not use those words so we need to normalize them to the PTT's status values.
    def _apply_updates(self, ptt, reply):
        norm = {"to-do": "todo", "completed": "done", "not applicable": "na"}
        for line in reply.strip().splitlines():
            line = line.strip()
            if line.startswith("ADD "):
                parent, task_id, title = [p.strip() for p in line[4:].split("|", 2)]
                ptt.add_task(title, parent_id=parent, task_id=task_id)
            elif line.startswith("STATUS "):
                node_id, status = [p.strip() for p in line[7:].split("|")]
                ptt.set_status(node_id, norm.get(status, status))
            elif line.startswith("RESULT "):
                node_id, result = [p.strip() for p in line[7:].split("|", 1)]
                ptt.set_result(node_id, result)      # overwrites a raw tool dump with Parsing's summary
            elif line.startswith("GOAL "):
                ptt.mark_goal(line[5:].strip())