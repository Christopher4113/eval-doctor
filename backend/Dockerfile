FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY demo/ /app/demo/
ENV DEMO_DIR=/app/demo PORT=5001
EXPOSE 5001
CMD ["python", "app.py"]
