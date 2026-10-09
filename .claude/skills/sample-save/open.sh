#!/bin/zsh
set -e
cd "${0:A:h}/../../.."
page=$1 sample=$2 lang=${3:-en} storage=${4:-'{}'}
agent-browser open about:blank >/dev/null
agent-browser network route "**/save.json" --body "$(cat samples/$sample.json)" >/dev/null
agent-browser network route "**/egg-purchases.json" --body "$(cat samples/$sample.purchases.json 2>/dev/null || echo '[]')" >/dev/null
agent-browser open "http://127.0.0.1:5173/$page.html" >/dev/null
agent-browser eval "localStorage.clear(); localStorage.setItem('tokendex-lang', '$lang'); Object.entries($storage).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v))); 0" >/dev/null
agent-browser reload >/dev/null
