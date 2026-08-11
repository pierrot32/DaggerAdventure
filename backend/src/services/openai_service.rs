use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::{config::Config, error::AppError};

#[derive(Debug, Serialize)]
struct ChatCompletionRequest<'a> {
    model: &'a str,
    messages: [ChatMessage<'a>; 2],
    max_completion_tokens: u16,
}

#[derive(Debug, Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Debug, Deserialize)]
struct ChatMessageResponse {
    content: Option<String>,
}

#[derive(Debug, Serialize)]
struct ImageGenerationRequest<'a> {
    model: &'a str,
    prompt: &'a str,
    n: u8,
    size: &'a str,
}

#[derive(Debug, Deserialize)]
struct ImageGenerationResponse {
    data: Vec<GeneratedImage>,
}

#[derive(Debug, Deserialize)]
struct GeneratedImage {
    b64_json: Option<String>,
    url: Option<String>,
}

pub async fn generate(config: &Config, prompt: &str) -> Result<String, AppError> {
    generate_with_system_prompt(
        config,
        "You are a concise, imaginative assistant for a Daggerheart character builder. Help create names, backstories, motives, relationships, and other character details. Follow the user's request and format the result clearly.",
        prompt,
    )
    .await
}

pub async fn generate_with_system_prompt(
    config: &Config,
    system_prompt: &str,
    prompt: &str,
) -> Result<String, AppError> {
    let api_key = config.openai_api_key.as_deref().ok_or_else(|| {
        AppError::ServiceUnavailable("AI generation is not configured".to_owned())
    })?;

    let request = ChatCompletionRequest {
        model: &config.openai_model,
        max_completion_tokens: 1000,
        messages: [
            ChatMessage {
                role: "system",
                content: system_prompt,
            },
            ChatMessage {
                role: "user",
                content: prompt,
            },
        ],
    };

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|_| AppError::Internal("OpenAI request failed".to_owned()))?;

    let status = response.status();
    if !status.is_success() {
        eprintln!("OpenAI chat completion failed with status {status}");
        return Err(if status == StatusCode::TOO_MANY_REQUESTS {
            AppError::ServiceUnavailable("AI generation is temporarily unavailable".to_owned())
        } else {
            AppError::Internal("OpenAI request failed".to_owned())
        });
    }

    let completion = response
        .json::<ChatCompletionResponse>()
        .await
        .map_err(|_| AppError::Internal("Invalid OpenAI response".to_owned()))?;

    completion
        .choices
        .into_iter()
        .next()
        .and_then(|choice| choice.message.content)
        .filter(|content| !content.trim().is_empty())
        .ok_or_else(|| AppError::Internal("OpenAI returned an empty response".to_owned()))
}

pub async fn generate_image(config: &Config, prompt: &str) -> Result<String, AppError> {
    let api_key = config.openai_api_key.as_deref().ok_or_else(|| {
        AppError::ServiceUnavailable("AI generation is not configured".to_owned())
    })?;
    let request = ImageGenerationRequest {
        model: &config.openai_image_model,
        prompt,
        n: 1,
        size: "1024x1024",
    };

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/images/generations")
        .bearer_auth(api_key)
        .json(&request)
        .send()
        .await
        .map_err(|_| AppError::Internal("OpenAI image request failed".to_owned()))?;
    let status = response.status();
    if !status.is_success() {
        eprintln!("OpenAI image generation failed with status {status}");
        return Err(if status == StatusCode::TOO_MANY_REQUESTS {
            AppError::ServiceUnavailable(
                "AI image generation is temporarily unavailable".to_owned(),
            )
        } else {
            AppError::Internal("OpenAI image request failed".to_owned())
        });
    }

    let result = response
        .json::<ImageGenerationResponse>()
        .await
        .map_err(|_| AppError::Internal("Invalid OpenAI image response".to_owned()))?;
    let image = result
        .data
        .into_iter()
        .next()
        .ok_or_else(|| AppError::Internal("OpenAI returned no image".to_owned()))?;
    if let Some(encoded) = image.b64_json {
        return Ok(format!("data:image/png;base64,{encoded}"));
    }
    image
        .url
        .filter(|url| !url.trim().is_empty())
        .ok_or_else(|| AppError::Internal("OpenAI returned no usable image".to_owned()))
}
