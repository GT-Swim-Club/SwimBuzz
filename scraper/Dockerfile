FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PLAYWRIGHT_HEADLESS=true
ENV PORT=8000

EXPOSE 8000

CMD uvicorn main:app --host 0.0.0.0 --port ${PORT}
