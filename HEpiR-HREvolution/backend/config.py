from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    hrflow_api_key: str
    hrflow_user_email: str
    hrflow_source_key: str
    hrflow_board_key: str

    llm_api_key: str
    llm_base_url: str = "https://openrouter.ai/api/v1"
    llm_model: str = "nvidia/nemotron-3-super-120b-a12b:free"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
