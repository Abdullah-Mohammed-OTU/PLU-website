# Deploying walmart-plu to AWS EC2 (Free Tier)

End state: a `t2.micro` or `t3.micro` running the Flask app behind Caddy, which
auto-provisions a Let's Encrypt certificate so the mic works on phones.

## 1. Get a hostname

Let's Encrypt needs a real DNS name pointing at your EC2 public IP. Pick one:
- You already own a domain → create an `A` record → `<your-ec2-public-ip>`
- Free subdomain: <https://www.duckdns.org> → sign in → create
  `walmart-plu.duckdns.org` → set current IP

## 2. Launch the EC2 instance

AWS Console → EC2 → **Launch instance**:
- **Name**: `walmart-plu`
- **AMI**: Ubuntu Server 24.04 LTS (x86_64)
- **Instance type**: `t2.micro` (or `t3.micro`) — free tier eligible
- **Key pair**: create or reuse one; download the `.pem`
- **Network settings → edit → Security group**, allow from `0.0.0.0/0`:
  - SSH (22)
  - HTTP (80)
  - HTTPS (443)
- **Storage**: 8 GiB gp3 (default) is plenty
- **Launch**

Copy the **public IPv4 address** once it's running and update your DNS record
if needed.

## 3. Connect

```bash
chmod 400 ~/Downloads/your-key.pem
ssh -i ~/Downloads/your-key.pem ubuntu@<EC2_PUBLIC_IP>
```

## 4. Install Docker

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker ubuntu
exit      # log back in so the group membership takes effect
```

Reconnect:
```bash
ssh -i ~/Downloads/your-key.pem ubuntu@<EC2_PUBLIC_IP>
docker run --rm hello-world     # sanity check
```

## 5. Copy the project to the server

**Option A — rsync from your Mac** (simplest):
```bash
# run on your Mac
cd /Users/abdullah/Documents/Walmart_Project
rsync -avz --exclude node_modules --exclude .venv \
  -e "ssh -i ~/Downloads/your-key.pem" \
  walmart_plu/ ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/walmart_plu/
```

**Option B — git** (if you've pushed it):
```bash
# on the EC2 box
git clone <your-repo-url> walmart_plu
```

## 6. Launch it

On the EC2 instance:
```bash
cd ~/walmart_plu
echo "SITE_ADDRESS=walmart-plu.duckdns.org" > .env   # use YOUR hostname
docker compose up -d --build
docker compose logs -f caddy                         # watch Let's Encrypt issue the cert (~30s)
```

Open `https://<your-hostname>` on your phone. Voice + barcode should work.

## 7. Update / redeploy

After editing code:
```bash
# from Mac
rsync -avz --exclude node_modules --exclude .venv \
  -e "ssh -i ~/Downloads/your-key.pem" \
  walmart_plu/ ubuntu@<EC2_PUBLIC_IP>:/home/ubuntu/walmart_plu/
# on EC2
cd ~/walmart_plu && docker compose up -d --build
```

## Troubleshooting

- **Caddy can't get a cert** → `docker compose logs caddy`. Usually DNS hasn't
  propagated (`dig +short <host>` should return your EC2 IP) or port 80/443 is
  blocked in the security group.
- **Can't reach site at all** → confirm the security group allows 80 and 443
  from `0.0.0.0/0`.
- **Mic still blocked on phone** → you're hitting `http://` not `https://`; the
  Web Speech API refuses non-secure origins.
- **Out of memory on t2.micro** (1 GB) → add swap:
  ```bash
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

## Cost note

`t2.micro` / `t3.micro` is free for 750 hrs/month during the first 12 months.
After that, ~\$8–10/mo. Data transfer out is 100 GB/mo free.
