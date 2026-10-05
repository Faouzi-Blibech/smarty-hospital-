"""MQTT ingestion worker (owner: Wali). Run with `python -m app.iot.worker`.

Scaffold only: it stays alive so the `worker` container starts. The real implementation
subscribes to hospital/device/+/{vitals,events,status} per docs/contracts/mqtt-topics.md.
"""

import time


def main() -> None:
    print("ward worker: scaffold running (no ingestion yet)", flush=True)
    while True:
        time.sleep(3600)


if __name__ == "__main__":
    main()
