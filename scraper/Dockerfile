FROM mcr.microsoft.com/playwright/python:v1.61.0-jammy

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PLAYWRIGHT_HEADLESS=false
ENV PORT=8000

EXPOSE 8000

# Headed Chromium + xvfb is less likely to trip Cloudflare than headless on datacenter IPs.
CMD xvfb-run --auto-servernum --server-args="-screen 0 1280x800x24" uvicorn main:app --host 0.0.0.0 --port ${PORT}
