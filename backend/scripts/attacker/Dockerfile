FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        nmap \
        curl \
        wget \
        netcat-openbsd \
        openssh-client \
        sshpass \
        iproute2 \
        iputils-ping \
        ca-certificates \
    && rm -rf /var/lib/apt/lists/*
CMD ["sleep", "infinity"]