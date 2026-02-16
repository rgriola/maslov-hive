# GitHub Repository Setup Instructions

Quick guide to create and push the Bot-Talker repository to GitHub.

## Step 1: Initialize Local Git Repository

```bash
cd /Users/rgriola/Desktop/01_Vibecode/Bot-Talker

# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: Bot-Talker AI Agent Social Network

- Add project planning documents
- Add implementation prompts for 6-step development
- Add README with project overview
- Configure .gitignore for Next.js, Prisma, and secrets"
```

## Step 2: Create GitHub Repository

**Option A: Using GitHub CLI (gh)**
```bash
# Install GitHub CLI if not already installed
brew install gh

# Authenticate with GitHub
gh auth login

# Create repository
gh repo create bot-talker \
  --public \
  --description "AI Agent Social Network - A Reddit-style platform where AI agents autonomously interact" \
  --source=. \
  --remote=origin \
  --push
```

**Option B: Using GitHub Web Interface**

1. Go to https://github.com/new
2. Fill in:
   - **Repository name**: `bot-talker`
   - **Description**: "AI Agent Social Network - A Reddit-style platform where AI agents autonomously interact"
   - **Visibility**: Public (or Private if preferred)
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
3. Click "Create repository"
4. Follow the commands GitHub provides for "push an existing repository":

```bash
git remote add origin https://github.com/YOUR_USERNAME/bot-talker.git
git branch -M main
git push -u origin main
```

## Step 3: Verify Repository

```bash
# Check remote is set
git remote -v

# Verify all files are tracked
git status

# View commit history
git log --oneline
```

Visit your repository at: `https://github.com/YOUR_USERNAME/bot-talker`

## Step 4: Add Repository Topics (Optional)

On GitHub, add these topics to help with discoverability:
- `ai-agents`
- `social-network`
- `nextjs`
- `bluesky`
- `typescript`
- `autonomous-agents`
- `postgresql`
- `prisma`

## Step 5: Configure Repository Settings (Optional)

### Branch Protection
Settings → Branches → Add rule:
- Branch name pattern: `main`
- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass before merging

### Secrets (for future CI/CD)
Settings → Secrets and variables → Actions:
- Add `DATABASE_URL` (if deploying)
- Add `BLUESKY_SERVICE_URL`
- Add other environment variables

## Important Notes

⚠️ **Never commit these files:**
- `.env.local` - Contains API keys and passwords
- `node_modules/` - Dependencies (will be regenerated)
- Agent API keys or secrets

✅ **Safe to commit:**
- Planning documents (`.md` files)
- Source code
- Configuration templates
- Documentation
- `.gitignore`, `README.md`, etc.

## Future Workflow

```bash
# Make changes
git add .
git commit -m "Add: description of changes"
git push origin main

# Create feature branches
git checkout -b feature/new-agent-behavior
# ... make changes ...
git commit -m "Add new agent behavior"
git push origin feature/new-agent-behavior
# Create pull request on GitHub
```

## Useful Commands

```bash
# Check repository status
git status

# View commit history
git log --oneline --graph

# Create and switch to new branch
git checkout -b branch-name

# Push to remote
git push origin branch-name

# Pull latest changes
git pull origin main

# View remote URL
git remote -v
```

## Next Steps After Creating Repo

1. ✅ Update README.md with your actual GitHub username
2. ✅ Add a LICENSE file (MIT recommended)
3. ✅ Create GitHub Issues for planned features
4. ✅ Set up GitHub Actions for CI/CD (optional)
5. ✅ Add CONTRIBUTING.md guidelines (optional)
6. ✅ Start implementing from [agent-prompts-implementation.md](agent-prompts-implementation.md)!
