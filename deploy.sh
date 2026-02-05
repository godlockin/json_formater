#!/bin/bash
# Deploy to GitHub Pages

# Enable GitHub Pages in repository settings
# Or use this script with gh CLI

echo "Deploying to GitHub Pages..."

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "GitHub CLI (gh) not found. Please install it first:"
    echo "brew install gh"
    exit 1
fi

# Check if logged in
gh auth status > /dev/null 2>&1 || {
    echo "Please login to GitHub first: gh auth login"
    exit 1
}

# Get repo info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner)

# Create gh-pages branch if not exists
if ! git show-ref --verify --quiet refs/heads/gh-pages; then
    git checkout --orphan gh-pages
    git rm -rf .
    git checkout main -- public/
    mv public/* .
    rm -rf public/
    git add .
    git commit -m "Deploy to GitHub Pages"
    git push origin gh-pages
else
    echo "gh-pages branch already exists"
    git checkout gh-pages
    git rm -rf .
    git checkout main -- public/
    mv public/* .
    rm -rf public/
    git add .
    git commit -m "Deploy to GitHub Pages - $(date)"
    git push origin gh-pages
    git checkout main
fi

echo "✅ Deployed to: https://$REPO"
