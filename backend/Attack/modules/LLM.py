#template for PentestGPT agent. Behaviour and skills comes from the connected Parameter's instructions
#instruction/parameter (laoded by the mapper)
#Writeback uses the tree-op grammar our DataFile uses. 
#The API key is read from an env var whose NAME is in the apiKey property
#each time this module is reached we open a new session and giev it contexta and the current state of the attack. 
#The LLM is expected to return a set of updates to the PTT, which we apply to the shared data structure.

import os, json, urllib.request #we need os so we can read the API key from the env var, json to parse the API response, and urllib to make the HTTP request
#the api speaks json so we need to encode the prompt as json and decode the response as json
from modules.block import Block


#Dotenv is a library that manages environment variables for applications. It reads key-value pairs
# from a .env file and loads them into the application's environment, allowing for configuration 
#settings to be stored separately from the code
try: 
    from dotenv import load_dotenv          # rather than hardcoding the API key in the code, we read it from a .env file for security. 
except ImportError: # if not installed, we define a no-op load_dotenv so the code still runs, but the user must set the env var manually.
    load_dotenv = lambda *a, **k: None


class LLM(Block):
    def run(self, data_stack):
        ptt = data_stack.peek()#we have to first access PTT to allow the LLM to read the current state of the attack and what tasks have been completed and what tasks are still to be done
        instruction = self.properties.get("instruction", "")#to decide wich mode of agent we are using 
        prompt = f"{instruction}\n\nCurrent task tree:\n{ptt.render()}"
        reply = self._call_api(prompt)
        self._apply_updates(ptt, reply) # The LLM reply is expected to be in a specific format that indicates what tasks to add, what statuses to update, and what the goal is
        print(f"[LLM] applied updates")

    def _call_api(self, prompt):#this is the function that actually calls the API and returns the response. It uses the requests library to make a POST request to the API endpoint with the prompt as the payload.
    # The response is then parsed and returned as a string.
        load_dotenv()                                        # read .env into os.environ
        key_env = self.properties.get("apiKey", "ANTHROPIC_API_KEY")  # the VAR NAME we fae reading from (in future we could have more but for now we are just using one )
        api_key = os.environ.get(key_env, "")
        if not api_key:                                      # fail clearly, not with a cryptic HTTP error
            raise RuntimeError(f"No API key: env var {key_env!r} is not set (check your .env)")
        model = self.properties.get("model", "claude-sonnet-4-6") # in future we could use different models for different agents, but for now we are just using one model
        body = json.dumps({"model": model, "max_tokens": 1024,
                           "messages": [{"role": "user", "content": prompt}]}).encode()# since urllib doesn't do json automatically, we have to encode the prompt as json and then encode it as bytes. The API expects a JSON payload with the model, max_tokens, and messages fields.
        req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body,
            headers={"content-type": "application/json", "x-api-key": api_key,
                     "anthropic-version": "2023-06-01"})
        with urllib.request.urlopen(req) as resp:# we use with to ensure the response is properly closed after we are done with it
            return json.loads(resp.read())["content"][0]["text"]# we get the response as a JSON object and then extract the text from the first message in the content array


#our paramester instructions alraedy return tasks with specific words, but our PTT does not use those words so we need to normalize them to the PTT's status values.
    def _apply_updates(self, ptt, reply):
        norm = {"to-do": "todo", "completed": "done", "not applicable": "na"}
        for line in reply.strip().splitlines():
            line = line.strip()
            if line.startswith("ADD "):
                parent, task_id, title = [p.strip() for p in line[4:].split("|")]
                ptt.add_task(title, parent_id=parent, task_id=task_id)
            elif line.startswith("STATUS "):
                node_id, status = [p.strip() for p in line[7:].split("|")]
                ptt.set_status(node_id, norm.get(status, status))
            elif line.startswith("GOAL "):
                ptt.mark_goal(line[5:].strip())