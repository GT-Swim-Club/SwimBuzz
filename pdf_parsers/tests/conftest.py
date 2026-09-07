def pytest_addoption(parser):
    parser.addoption(
        "--snapshot-update",
        action="store_true",
        default=False,
        help="Write current parser output as the committed snapshot instead of diffing against it.",
    )
