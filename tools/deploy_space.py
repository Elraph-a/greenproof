#!/usr/bin/env python3
"""Push the verification service to its Hugging Face Space.

    python tools/deploy_space.py                    # push ml/ to the Space
    python tools/deploy_space.py --dry-run          # list what would go, send nothing
    python tools/deploy_space.py --space you/name   # override the target

WHAT GETS PUSHED, AND WHAT DELIBERATELY DOES NOT

Only `ml/`. The Space needs the service and nothing else - not the app, not the
pilot photos, not the tools. A smaller upload is a faster build, and every file
that does not need to be public should not be.

`ml/README.md` goes up as the Space card. Its YAML frontmatter is what tells
Spaces this is `sdk: docker` on port 7860, so it is not documentation - it is
configuration, and the build fails without it.

THIS IS NOT GITHUB. The Space is a separate git remote. Pushing here does not
push anything to `origin`, and the two can be out of step without harm.

SECRETS ARE NOT PUSHED AND CANNOT BE. They are set in the Space's own settings
UI - see docs/DEPLOY_SPACE.md. This script refuses to upload a .env if one ever
appears in ml/, because the single worst outcome here is publishing the Supabase
service key, which can write any verdict for any tree.

CREDENTIALS. Needs HF_TOKEN (a WRITE token from huggingface.co/settings/tokens)
in the environment or in the repo .env, which is gitignored.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ML = ROOT / "ml"

DEFAULT_SPACE = "Elrpahaa/greenproof-ml"

# Never upload these, whatever else changes. Belt and braces on top of
# .dockerignore: that file governs the Docker build context, not this upload.
BLOCKED = {".env", ".env.local", "credentials.json", "token.json"}
BLOCKED_SUFFIXES = {".key", ".pem"}
SKIP_DIRS = {"__pycache__", ".pytest_cache", ".ruff_cache", ".git"}


def load_env() -> None:
    """Read a .env without requiring python-dotenv.

    Only fills variables that are not already set, so a real environment
    variable always beats a stale file.
    """
    for candidate in (ROOT / ".env", ML / ".env"):
        if not candidate.exists():
            continue
        for line in candidate.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k and v and k not in os.environ:
                os.environ[k] = v


def payload() -> list[Path]:
    """Every file that would be uploaded, relative to ml/."""
    out: list[Path] = []
    for p in sorted(ML.rglob("*")):
        if not p.is_file():
            continue
        if any(part in SKIP_DIRS for part in p.relative_to(ML).parts):
            continue
        out.append(p)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", default=DEFAULT_SPACE, help="owner/name")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument(
        "--create",
        action="store_true",
        help="create the Space if it does not exist (sdk=docker)",
    )
    args = ap.parse_args()

    load_env()

    files = payload()

    # Refuse before authenticating, not after. A credential leak is the one
    # failure here that cannot be undone by pushing again.
    leaked = [
        p for p in files
        if p.name in BLOCKED or p.suffix in BLOCKED_SUFFIXES
    ]
    if leaked:
        print("REFUSING TO PUSH - these look like secrets:", file=sys.stderr)
        for p in leaked:
            print(f"  {p.relative_to(ROOT)}", file=sys.stderr)
        print(
            "\nSecrets belong in the Space's Settings -> Variables and secrets,\n"
            "never in the repository. See docs/DEPLOY_SPACE.md.",
            file=sys.stderr,
        )
        return 2

    total = sum(p.stat().st_size for p in files)
    print(f"{len(files)} file(s), {total/1024:.0f} KB  ->  {args.space}")
    for p in files:
        print(f"  {p.relative_to(ML)}")

    if args.dry_run:
        print("\n--dry-run: nothing sent.")
        return 0

    if not os.environ.get("HF_TOKEN"):
        print(
            "\nHF_TOKEN is not set.\n"
            "Create a WRITE token at https://huggingface.co/settings/tokens\n"
            "and add it to .env (which is gitignored):\n\n"
            "    HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxx\n",
            file=sys.stderr,
        )
        return 2

    from huggingface_hub import HfApi

    api = HfApi(token=os.environ["HF_TOKEN"])

    try:
        me = api.whoami()
        print(f"\nauthenticated as {me.get('name')}")
    except Exception as e:  # noqa: BLE001
        print(f"\nHF_TOKEN rejected: {str(e)[:160]}", file=sys.stderr)
        print("Check it is a WRITE token and has not been revoked.", file=sys.stderr)
        return 2

    if args.create:
        from huggingface_hub.errors import HfHubHTTPError

        try:
            api.create_repo(
                repo_id=args.space,
                repo_type="space",
                space_sdk="docker",
                exist_ok=True,
            )
            print(f"space ready: {args.space}")
        except HfHubHTTPError as e:
            print(f"could not create the space: {str(e)[:200]}", file=sys.stderr)
            return 1

    print("uploading...", flush=True)
    try:
        api.upload_folder(
            folder_path=str(ML),
            repo_id=args.space,
            repo_type="space",
            # Mirrors SKIP_DIRS. Caches are large, useless to the build, and
            # slow the upload for no benefit.
            ignore_patterns=["**/__pycache__/**", "**/.pytest_cache/**", "**/.git/**"],
            commit_message="Deploy verification service",
        )
    except Exception as e:  # noqa: BLE001
        print(f"upload failed: {str(e)[:200]}", file=sys.stderr)
        return 1

    owner, _, name = args.space.partition("/")
    host = f"{owner}-{name}".lower()
    print(
        f"""
pushed.

  build log   https://huggingface.co/spaces/{args.space}?logs=build
  endpoint    https://{host}.hf.space

The first build takes several minutes - it installs onnxruntime and OpenCV and
bakes the DINOv2 weights into the image, so cold start is never a 90 MB
download.

NEXT, and it will not work until you do:

  1. Space -> Settings -> Variables and secrets. Four values, three of them
     secrets. See docs/DEPLOY_SPACE.md.
  2. Space -> Settings -> Sleep time -> never. A sleeping Space cold-starts on
     stage, which is the failure mode this migration exists to remove.
  3. curl https://{host}.hf.space/health
  4. python tools/set_ml_url.py https://{host}.hf.space
"""
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
