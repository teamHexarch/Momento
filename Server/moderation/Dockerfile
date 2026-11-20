FROM python:3.11-slim
WORKDIR /models
COPY moderation/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY moderation/models.py .
ENV HF_HOME=/cache
CMD ["python", "-u", "models.py"]
