import telnyx
import os
import dotenv

dotenv.load_dotenv()

import telnyx
telnyx.api_key = os.getenv("TELNYX_API_KEY")

call = telnyx.Call.create(
    connection_id="2717938964529939955",
    to="+12179040977",
    from_="+14159078140",
    from_display_name="Company Name",
    conference_config={
        "conference_name": "telnyx-conference",
        "start_conference_on_enter": True
    },
    audio_url="http://www.example.com/sounds/greeting.wav",
    timeout_secs=60,
    timeout_limit_secs=60,
    webhook_url="https://www.example.com/server-b/",
    webhook_url_method="POST",
    answering_machine_detection="detect",
    answering_machine_detection_config={
        "total_analysis_time_millis": 5000,
        "after_greeting_silence_millis": 1000,
        "between_words_silence_millis": 1000,
        "greeting_duration_millis": 1000,
        "initial_silence_millis": 1000,
        "maximum_number_of_words": 1,
        "maximum_word_length_millis": 2000,
        "silence_threshold": 512,
        "greeting_total_analysis_time_millis": 50000,
        "greeting_silence_duration_millis": 2000
    },
    custom_headers=[
        {"name": "head_1", "value": "val_1"},
        {"name": "head_2", "value": "val_2"}
    ],
    client_state="aGF2ZSBhIG5pY2UgZGF5ID1d",
    command_id="891510ac-f3e4-11e8-af5b-de00688a4901",
    link_to="ilditnZK_eVysupV21KzmzN_sM29ygfauQojpm4BgFtfX5hXAcjotg==",
    media_encryption="SRTP",
    sip_auth_username="username",
    sip_auth_password="password",
    sip_headers=[
        {"name": "User-to-User", "value": "12345"}
    ],
    sip_transport_protocol="TLS",
    stream_url="wss://www.example.com/websocket",
    stream_track="both_tracks",
    send_silence_when_idle=True,
    enable_dialogflow=False,
    dialogflow_config={
        "analyze_sentiment": False,
        "partial_automated_agent_reply": False
    }
)