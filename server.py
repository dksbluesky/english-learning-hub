"""Serve the local English Learning app and its optional AI autofill endpoint."""

from __future__ import annotations

import getpass
import json
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.environ.get("ENGLISH_APP_PORT", "8000"))
MODEL = os.environ.get("OPENAI_MODEL", "gpt-6-luna")
MAX_INPUT_BYTES = 6000
FIELD_LIMITS = {
    "category": 80,
    "level": 2,
    "meaning": 500,
    "usage": 800,
    "example": 1200,
    "translation": 300,
    "context": 300,
}

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "category": {"type": "string", "description": "A concise learning topic."},
        "level": {"type": "string", "enum": ["B2", "C1", "C2", ""]},
        "meaning": {"type": "string", "description": "A concise English explanation or paraphrase."},
        "usage": {"type": "string", "description": "Part of speech and practical usage note for a word; usage and nuance for a sentence."},
        "example": {"type": "string", "description": "A natural English example. For a sentence input, provide a different sentence illustrating the same usage."},
        "translation": {"type": "string", "description": "A natural Traditional Chinese translation used in Taiwan."},
        "context": {"type": "string", "description": "A short situation or register note."},
    },
    "required": list(FIELD_LIMITS),
    "additionalProperties": False,
}


def json_bytes(data: object) -> bytes:
    return json.dumps(data, ensure_ascii=False).encode("utf-8")


class AppHandler(SimpleHTTPRequestHandler):
    server_version = "EnglishLearningLocal/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, format_string: str, *args: object) -> None:
        # Avoid logging submitted text or provider details.
        super().log_message(format_string, *args)

    def end_headers(self) -> None:
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def send_json(self, status: int, data: object) -> None:
        body = json_bytes(data)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if urlsplit(self.path).path == "/api/status":
            self.send_json(200, {"configured": bool(os.environ.get("OPENAI_API_KEY")), "model": MODEL})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urlsplit(self.path).path != "/api/autofill":
            self.send_json(404, {"error": "Not found."})
            return
        if self.client_address[0] not in {"127.0.0.1", "::1"}:
            self.send_json(403, {"error": "This local endpoint accepts requests from this computer only."})
            return
        allowed_hosts = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}
        allowed_origins = {f"http://{host}" for host in allowed_hosts}
        if self.headers.get("Host") not in allowed_hosts or self.headers.get("Origin") not in allowed_origins:
            self.send_json(403, {"error": "Open the app from its local address before using AI autofill."})
            return
        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            self.send_json(503, {"error": "AI autofill is not configured. Restart the local server and enter an API key, or use manual entry."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > MAX_INPUT_BYTES:
                raise ValueError
            payload = json.loads(self.rfile.read(length))
            kind = payload.get("kind") if isinstance(payload, dict) else None
            text = payload.get("text", "").strip() if isinstance(payload, dict) and isinstance(payload.get("text"), str) else ""
            if kind not in {"word", "sentence"} or not text or len(text) > 600:
                self.send_json(400, {"error": "Enter one word or sentence of up to 600 characters."})
                return
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "The autofill request was invalid."})
            return

        instructions = (
            "You are an English-learning vocabulary editor. Fill the supplied fields for one learner entry. "
            "Use clear, accurate, concise English and natural Traditional Chinese used in Taiwan. "
            "Choose B2, C1, C2, or an empty level when uncertain. Do not invent a source or claim certainty. "
            "For a word, provide its most common relevant sense and a natural example sentence. "
            "For a sentence, preserve its intended meaning, explain its tone and usage, and give a different natural example with similar usage. "
            "Return only the requested structured fields."
        )
        request_body = {
            "model": MODEL,
            "store": False,
            "instructions": instructions,
            "input": f"Entry type: {kind}\nLearner input: {text}",
            "max_output_tokens": 500,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "english_learning_entry",
                    "strict": True,
                    "schema": OUTPUT_SCHEMA,
                }
            },
        }
        request = Request(
            "https://api.openai.com/v1/responses",
            data=json_bytes(request_body),
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=45) as response:
                result = json.loads(response.read())
        except HTTPError as error:
            if error.code == 401:
                message = "The API key was rejected. Restart the local server and check the key."
            elif error.code == 429:
                message = "The API request was limited or billing is not available for this key. Check your API account."
            else:
                message = "The AI service could not complete the request. Try again or use manual entry."
            self.send_json(502, {"error": message})
            return
        except (TimeoutError, URLError):
            self.send_json(502, {"error": "The AI service could not be reached. Check your internet connection and try again."})
            return
        except (json.JSONDecodeError, OSError):
            self.send_json(502, {"error": "The AI service returned an unreadable response. Try again."})
            return

        generated_text = ""
        if not isinstance(result, dict) or not isinstance(result.get("output"), list):
            self.send_json(502, {"error": "The AI service returned an unreadable response. Try again."})
            return
        for item in result["output"]:
            if not isinstance(item, dict):
                continue
            if item.get("type") != "message":
                continue
            for part in item.get("content", []):
                if not isinstance(part, dict):
                    continue
                if part.get("type") == "output_text":
                    generated_text += part.get("text", "")
                elif part.get("type") == "refusal":
                    self.send_json(502, {"error": "The AI service could not generate these details. Try manual entry."})
                    return
        try:
            generated = json.loads(generated_text)
            if not isinstance(generated, dict) or any(
                not isinstance(generated.get(key), str) or len(generated[key]) > limit
                for key, limit in FIELD_LIMITS.items()
            ) or generated["level"] not in {"", "B2", "C1", "C2"}:
                raise ValueError
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            self.send_json(502, {"error": "The AI response did not match the entry fields. Try again."})
            return
        self.send_json(200, generated)


def main() -> None:
    if not os.environ.get("OPENAI_API_KEY") and not os.environ.get("ENGLISH_SKIP_KEY_PROMPT") and sys.stdin.isatty():
        print("Enter an OpenAI API key for AI autofill, or press Enter to use manual entry only.")
        key = getpass.getpass("API key (hidden): ").strip()
        if key:
            os.environ["OPENAI_API_KEY"] = key
    mode = "AI autofill enabled" if os.environ.get("OPENAI_API_KEY") else "manual entry only"
    server = ThreadingHTTPServer((HOST, PORT), AppHandler)
    print(f"English Learning Library: http://127.0.0.1:{PORT}/ ({mode})")
    print("Press Ctrl+C to stop the local server.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLocal server stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
