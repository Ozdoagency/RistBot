import sys
from transformers import AutoTokenizer, AutoModelForCausalLM

# Проверка аргументов
if len(sys.argv) < 2:
    print("Введите текст для генерации.")
    sys.exit(1)

# Загрузка модели и токенизатора
tokenizer = AutoTokenizer.from_pretrained("facebook/opt-30b")
model = AutoModelForCausalLM.from_pretrained("facebook/opt-30b")

# Вводный текст
input_text = sys.argv[1]

# Токенизация входного текста
inputs = tokenizer(input_text, return_tensors="pt")

# Генерация текста
outputs = model.generate(
    **inputs, max_length=100, do_sample=True, temperature=0.7
)

# Декодирование и вывод результата
generated_text = tokenizer.decode(outputs[0], skip_special_tokens=True)
print(generated_text)
