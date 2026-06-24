# AWS Free Tier Deployment Guide for Hyphening Ops Center

This guide outlines how to host the **Hyphening Marketing Ops Center** on AWS for free using the **AWS Free Tier**.

---

## 1. Prerequisites & AWS Free Tier Services Used
- **AWS EC2 (Elastic Compute Cloud)**: 750 hours/month of a `t2.micro` (or `t3.micro` depending on region) instance running Ubuntu Linux, free for the first 12 months.
- **Elastic IP**: A static public IP address for your server (free as long as it is associated with a running instance).
- **Domain Name**: A custom domain pointing to your EC2 instance (required for automatic SSL certificate generation via Caddy).

---

## 2. Launching the EC2 Instance
1. Log in to the [AWS Management Console](https://console.aws.aws.com/).
2. Navigate to **EC2 Dashboard** and click **Launch Instance**.
3. Configure the following:
   - **Name**: `hyphening-ops-center`
   - **OS Image (AMI)**: Select **Ubuntu Server 24.04 LTS** (marked "Free tier eligible").
   - **Instance Type**: Select `t2.micro` (or `t3.micro` if in a region where t2 isn't Free Tier eligible, e.g. Stockholm).
   - **Key Pair**: Select or create a new key pair (`.pem`) to access the server via SSH. Download and keep this safe.
   - **Network Settings (Security Group)**:
     Check the boxes to:
     - Allow SSH traffic (Port 22) from your IP.
     - Allow HTTP traffic (Port 80) from the internet.
     - Allow HTTPS traffic (Port 443) from the internet.
4. Click **Launch Instance**.

---

## 3. Allocating and Assigning an Elastic IP (Static IP)
By default, the IP of an EC2 instance changes when stopped/started. To prevent DNS configuration breaks:
1. In the EC2 console left sidebar, scroll down to **Network & Security** -> **Elastic IPs**.
2. Click **Allocate Elastic IP address**, select default settings, and click **Allocate**.
3. Select the newly allocated IP, click **Actions** -> **Associate Elastic IP address**.
4. Choose **Instance**, select your `hyphening-ops-center` instance, and click **Associate**.
5. Copy this public IP.

---

## 4. Configuring DNS & Nameservers

To link your domain name (e.g. `yourdomain.com`) to your EC2 instance:

### Option A: Using AWS Route 53 Nameservers (Recommended)
1. Navigate to **Route 53** in the AWS console.
2. Click **Create Hosted Zone**. Enter your domain name and choose **Public Hosted Zone**.
3. AWS will generate 4 **Nameserver (NS) records** (e.g. `ns-xxxx.awsdns-xx.org`).
4. Log into your domain registrar (GoDaddy, Namecheap, Domain.com, etc.), locate the **Custom Nameservers** section, and replace the default nameservers with the 4 nameservers provided by AWS Route 53.
5. In the Route 53 console, click **Create Record**:
   - **Record Type**: `A`
   - **Value/Alias**: Paste your **Elastic IP**.
   - Save the record.

### Option B: Using Domain Registrar DNS Settings (Direct A-Record)
If you prefer to keep your nameservers with your registrar:
1. Log into your domain registrar's DNS settings panel.
2. Add an **A Record**:
   - **Host/Name**: `@` (for root domain) or a subdomain (like `ops`).
   - **Value/Points to**: Paste your **Elastic IP**.
   - **TTL**: Select the lowest value (e.g. `600` seconds or `Auto`).

---

## 5. Connecting and Setting Up the Server
Open your terminal on your local machine and SSH into the instance:
```bash
# Set secure permissions for your key file
chmod 400 your-key.pem

# SSH connect (replace with your Elastic IP)
ssh -i your-key.pem ubuntu@YOUR_ELASTIC_IP
```

### Install Node.js & PM2
Once connected, update the system packages and install Node.js via NVM:
```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install git, curl, and build-essential
sudo apt install -y git curl build-essential

# Install NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc

# Install Node.js v20 (LTS)
nvm install 20
nvm use 20

# Install PM2 Process Manager globally
npm install -g pm2
```

### Install Caddy (Reverse Proxy with Automatic SSL)
Caddy automatically handles HTTPS configuration and SSL certificate renewal:
```bash
# Add Caddy repository
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list

# Install Caddy
sudo apt update
sudo apt install caddy -y
```

---

## 6. Deploying the Application
Clone your repository or upload your files to the server:
```bash
cd ~
git clone https://github.com/your-username/hyphening.git
cd hyphening
```

### Install Backend & Frontend Dependencies
```bash
# Install backend dependencies
npm install

# Build frontend static files
cd frontend
npm install
npm run build
cd ..
```

### Configure Environment Variables
Create the production environment file:
```bash
nano .env
```
Copy and fill in your secrets (replace with secure random hexes and actual tokens):
```env
DB_PATH=./data/ops_dashboard.db
JWT_ACCESS_SECRET=d12404ec77cfc2ae1a17b17044bc5cc6026da3613...
JWT_REFRESH_SECRET=5e6165ef866c4ae1c64c514449de0ad1c959...
API_CREDENTIALS_KEY=2390c6a7f3f500987018d8fe79d5564...
ARTIST_BANK_KEY=b251e5187d74adbad7c8425f528d05d8...

PORT=3000
NODE_ENV=production
FRONTEND_ORIGIN=https://yourdomain.com
WEBSITE_URL=https://yourdomain.com

# Telegram Integrations
TELEGRAM_BOT_TOKEN=123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ
TELEGRAM_ADMIN_CHAT_ID=987654321
TELEGRAM_VIDEOGRAPHER_CHAT_ID=887654321
TELEGRAM_SMM_CHAT_ID=787654321

# Webhooks
OPENCLAW_HMAC_SECRET=your_hmac_secret_here
```
Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit.

---

## 7. Starting the Server Processes
Run the production Node server inside PM2:
```bash
# Start backend in cluster mode
pm2 start ecosystem.config.json --env production

# Ensure PM2 restarts on server reboots
pm2 startup
# (Copy and run the command printed by PM2 in the terminal to configure the startup daemon)

# Save process list
pm2 save
```

---

## 8. Launching the Web Server (Reverse Proxy)
Configure Caddy to bind port 80/443 traffic to the PM2 cluster running on port 3000:
1. Open the system Caddy configuration:
   ```bash
   sudo nano /etc/caddy/Caddyfile
   ```
2. Delete the default content and paste the Caddy configuration:
   ```caddy
   yourdomain.com {
       reverse_proxy localhost:3000
       encode gzip
       header {
           Permissions-Policy "interest-cohort=()"
           X-Frame-Options "SAMEORIGIN"
           X-Content-Type-Options "nosniff"
           Referrer-Policy "strict-origin-when-cross-origin"
       }
   }
   ```
   *(Replace `yourdomain.com` with your domain registered in Step 4).*
3. Restart Caddy to apply changes and trigger Let's Encrypt certificates:
   ```bash
   sudo systemctl restart caddy
   ```

---

## 9. Verification & Backups
- Visit `https://yourdomain.com` in your browser. The site will be active under secure SSL.
- Check server health: `curl https://yourdomain.com/api/health`
- **Database Backup**: SQLite writes to the `./data/ops_dashboard.db` file. Make sure to download daily copies of this file or configure a cron job to push backups to AWS S3 (Free Tier includes 5GB S3 storage).

---

## Appendix: How to Push Code from Local Machine to GitHub

To push the codebase changes from your local computer up to GitHub so you can clone/pull them onto the EC2 server:

1. **Verify Git Remote**:
   Ensure you have a remote pointing to your GitHub repository:
   ```bash
   git remote -v
   ```
   *(If you don't have one, add it: `git remote add origin https://github.com/your-username/hyphening.git`)*

2. **Stage and Commit Local Changes**:
   Stage all files and write a commit message:
   ```bash
   git add .
   git commit -m "feat: updated table layouts and added Telegram backlog notifications"
   ```

3. **Push to GitHub**:
   Push the changes to your main branch (typically `main` or `master`):
   ```bash
   git push origin main
   ```

4. **Update the EC2 Server**:
   On your EC2 terminal session, pull down the latest code updates:
   ```bash
   cd ~/hyphening
   git pull origin main
   npm install
   cd frontend && npm install && npm run build && cd ..
   pm2 restart all
   ```
