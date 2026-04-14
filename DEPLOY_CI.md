# CI/CD Setup — GitHub Actions → EC2

The workflow at `.github/workflows/ci-cd.yml` does two things:

1. **test** (runs on every push + PR): unit + functional (pytest) and E2E (Playwright chromium).
2. **deploy** (runs only on pushes to `main`, only after `test` passes): SSHes
   into EC2, pulls, rebuilds, and restarts the docker compose stack.

## One-time setup

### 1. Generate a deploy SSH key (on your Mac)

Use a dedicated key so you can rotate it independently.

```bash
ssh-keygen -t ed25519 -C "github-actions-walmart-plu" -f ~/.ssh/walmart_plu_deploy -N ""
```

Two files appear:
- `~/.ssh/walmart_plu_deploy`      (private — goes into GitHub)
- `~/.ssh/walmart_plu_deploy.pub`  (public — goes onto the EC2 box)

### 2. Authorize the deploy key on EC2

From the EC2 box (SSH in with your existing key first):

```bash
# paste the contents of walmart_plu_deploy.pub after the heredoc marker
cat >> ~/.ssh/authorized_keys <<'PUBKEY'
<paste the contents of ~/.ssh/walmart_plu_deploy.pub here>
PUBKEY
chmod 600 ~/.ssh/authorized_keys
```

Test from your Mac:
```bash
ssh -i ~/.ssh/walmart_plu_deploy ubuntu@walmartplu.duckdns.org "echo ok"
```
Should print `ok`.

### 3. Add GitHub repository secrets

GitHub → your repo → **Settings → Secrets and variables → Actions → New repository secret**. Add three:

| Name          | Value                                               |
| ------------- | --------------------------------------------------- |
| `EC2_HOST`    | `walmartplu.duckdns.org` (or the EC2 public IP)     |
| `EC2_USER`    | `ubuntu`                                            |
| `EC2_SSH_KEY` | entire contents of `~/.ssh/walmart_plu_deploy` (the **private** key, including `-----BEGIN…` and `-----END…` lines) |

### 4. (First-time only) Mark the EC2 repo safe for non-interactive pulls

The workflow uses `git reset --hard origin/main`. That's safe because the EC2
working tree shouldn't have local edits. If you have made local changes there,
either commit them or remove them before the first run.

## How to trigger deploys

```bash
git add .
git commit -m "your change"
git push origin main
```

Watch the run at **GitHub → Actions tab**. On success you'll see:
1. `test` job green (all 58 tests pass)
2. `deploy` job SSHes in, pulls, rebuilds
3. Smoke-test hits `https://<EC2_HOST>/` and expects `200`

## Troubleshooting

- **`Permission denied (publickey)`** → public key wasn't appended to
  `~/.ssh/authorized_keys` correctly, or private key was pasted into the GitHub
  secret without the `-----BEGIN…` / `-----END…` lines.
- **`git pull` fails** → local commits on the EC2 box. SSH in and
  `git status`; either `git stash` or `git reset --hard HEAD` before the next
  workflow run. (The workflow already does `git reset --hard origin/main`.)
- **`docker compose up` times out** → usually OOM on t2.micro. Add swap (see
  `DEPLOY_EC2.md` §Troubleshooting).
- **Smoke-test fails with 502** → app container hasn't finished booting. Re-run
  the workflow, or extend the retry loop in the workflow.
