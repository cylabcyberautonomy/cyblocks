FROM ubuntu:22.04
RUN apt-get update && apt-get install -y --no-install-recommends \
        nmap \
        curl \
        wget \
        netcat-openbsd \
        openssh-client \
        sshpass \
        hydra \
        ftp \
        python3 \
        iproute2 \
        iputils-ping \
        ca-certificates \
        mariadb-client\
    && rm -rf /var/lib/apt/lists/*
CMD ["sleep", "infinity"]