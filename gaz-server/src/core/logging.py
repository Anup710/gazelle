import json
import logging
import sys
import time


class JsonFormatter(logging.Formatter):
    def format(self, r: logging.LogRecord) -> str:
        payload: dict = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(r.created)),
            "level": r.levelname,
            "logger": r.name,
            "msg": r.getMessage(),
        }
        # Pull any structured extras attached via logger.info("...", extra={...})
        for k, v in r.__dict__.items():
            if k in ("args", "msg", "levelname", "levelno", "name", "pathname", "filename",
                     "module", "exc_info", "exc_text", "stack_info", "lineno", "funcName",
                     "created", "msecs", "relativeCreated", "thread", "threadName",
                     "processName", "process", "message", "taskName"):
                continue
            payload[k] = v
        if r.exc_info:
            payload["exc"] = self.formatException(r.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def setup_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level.upper())
    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel("WARNING")
    logging.getLogger("httpcore").setLevel("WARNING")
    logging.getLogger("urllib3").setLevel("WARNING")
