async function generateResponse(context) {
  try {
    const prompt = `${basePrompt}\n\nТекущий этап: ${context.stage}\nВопрос пользователя: ${context.message}`;
    
    const response = await fetch(HF_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_length: 150,
          temperature: 0.7
        }
      })
    });

    const result = await response.json();
    return result.generated_text;
  } catch (error) {
    throw new Error(`Ошибка HuggingFace API: ${error.message}`);
  }
}
