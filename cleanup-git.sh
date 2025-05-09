#!/bin/bash

# Script to remove files from git tracking that are now in .gitignore
echo "Removing files from git tracking that are now in .gitignore..."

# Remove build output files
git rm -r --cached dist/ build/ out/ .next/ 2>/dev/null || true

# Remove test and coverage files
git rm -r --cached coverage/ test-results/ .nyc_output/ 2>/dev/null || true

# Remove TypeScript build info files
git rm --cached "*.tsbuildinfo" 2>/dev/null || true

# Remove Terraform/Terragrunt files
git rm -r --cached .terraform/ 2>/dev/null || true
git rm --cached "*.tfstate" "*.tfstate.*" "*.tfvars" "*.tfvars.json" 2>/dev/null || true
git rm -r --cached .terragrunt-cache/ 2>/dev/null || true
git rm --cached .terraform.lock.hcl 2>/dev/null || true

# Remove temporary files
git rm --cached "*.swp" "*.swo" 2>/dev/null || true
git rm -r --cached .tmp/ temp/ 2>/dev/null || true

# Remove Docker related files
git rm -r --cached docker-volumes/ 2>/dev/null || true
git rm --cached "*.env.local" 2>/dev/null || true

# Remove database files
git rm -r --cached chroma-data/ 2>/dev/null || true
git rm --cached "*.db" "*.sqlite" "*.sqlite3" 2>/dev/null || true

# Remove frontend cache files
git rm -r --cached .cache/ public/dist/ storybook-static/ 2>/dev/null || true

# Remove IDE specific files
git rm -r --cached .history/ .settings/ 2>/dev/null || true
git rm --cached "*.sublime-*" .project .classpath 2>/dev/null || true

echo "Files have been removed from git tracking but kept in your working directory."
echo "You should now commit these changes with:"
echo "git commit -m \"Remove files that should be ignored according to .gitignore\""