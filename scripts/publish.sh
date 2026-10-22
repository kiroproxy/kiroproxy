#!/usr/bin/env bash
# 把当前聚合仓库同步到三个 GitHub 仓库：
#   kops      —— 私有聚合仓库（包含 docs，本地开发的 origin）
#   kiroproxy —— 公开代码仓库（剔除 docs/ 历史与内容）
#   docs      —— 私有文档仓库（只保留 docs/ 子目录）
#
# 用法：先 `git push kops main`，再运行本脚本（会强推另外两个仓库）。
# 依赖：git-filter-repo（brew install git-filter-repo 或 pip install git-filter-repo）。
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
KOPS_REMOTE=${KOPS_REMOTE:-kops}
PUBLIC_REMOTE=${PUBLIC_REMOTE:-public}
DOCS_REMOTE=${DOCS_REMOTE:-docs}
BRANCH=${BRANCH:-main}

require_remote() {
  if ! git remote get-url "$1" >/dev/null 2>&1; then
    echo "缺少远程 $1（git remote add $1 <url>）" >&2
    exit 1
  fi
}

require_filter_repo() {
  if ! command -v git-filter-repo >/dev/null 2>&1; then
    echo "缺少 git-filter-repo：brew install git-filter-repo" >&2
    exit 1
  fi
}

publish_public() {
  local tmp
  tmp=$(mktemp -d)
  echo "==> 生成公开仓库（剔除 docs）"
  git clone -q --no-hardlinks "$ROOT" "$tmp/repo"
  (
    cd "$tmp/repo"
    git checkout -q "$BRANCH"
    git-filter-repo --force --path docs --invert-paths >/dev/null
    git remote add public-target "$(git -C "$ROOT" remote get-url "$PUBLIC_REMOTE")"
    git push -q --force public-target "HEAD:$BRANCH"
    echo "    已推送 $(git rev-parse --short HEAD) → $PUBLIC_REMOTE/$BRANCH"
  )
  rm -rf "$tmp"
}

publish_docs() {
  local tmp
  tmp=$(mktemp -d)
  echo "==> 生成文档仓库（只保留 docs）"
  git clone -q --no-hardlinks "$ROOT" "$tmp/repo"
  (
    cd "$tmp/repo"
    git checkout -q "$BRANCH"
    git-filter-repo --force --subdirectory-filter docs >/dev/null
    git remote add docs-target "$(git -C "$ROOT" remote get-url "$DOCS_REMOTE")"
    git push -q --force docs-target "HEAD:$BRANCH"
    echo "    已推送 $(git rev-parse --short HEAD) → $DOCS_REMOTE/$BRANCH"
  )
  rm -rf "$tmp"
}

if [ -n "$(git status --porcelain)" ]; then
  echo "工作区有未提交的改动，先提交再发布。" >&2
  exit 1
fi

require_remote "$KOPS_REMOTE"
require_remote "$PUBLIC_REMOTE"
require_remote "$DOCS_REMOTE"
require_filter_repo

echo "==> 推送聚合仓库 $KOPS_REMOTE"
git push -q "$KOPS_REMOTE" "$BRANCH"
echo "    已推送 → $KOPS_REMOTE/$BRANCH"

publish_public
publish_docs

echo "完成：$KOPS_REMOTE（私有聚合）、$PUBLIC_REMOTE（公开代码）、$DOCS_REMOTE（私有文档）"
