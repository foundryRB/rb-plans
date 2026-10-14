"""Console entry point: run the app with uvicorn."""

from __future__ import annotations

import os

import uvicorn

__all__ = ["main"]


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("backend.adapters.http.app:create_app", factory=True, host=host, port=port)


if __name__ == "__main__":
    main()
