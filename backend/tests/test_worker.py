from app.iot import worker


def test_parse_topic():
    assert worker.parse_topic("hospital/device/bsu-001/vitals") == ("bsu-001", "vitals")
    assert worker.parse_topic("ward/internal/ws") is None
    assert worker.parse_topic("hospital/device/bsu-001/vitals/x") is None


def test_non_json_dropped():
    assert worker.process("bsu-001", "vitals", b"{not json") == []
