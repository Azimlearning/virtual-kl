"""Chroma is a vector database: it stores text alongside a numeric
"embedding" (a fingerprint of meaning) so you can search by similarity
of meaning rather than exact keyword match. The client library's
default embedding function runs a small local model to compute those
fingerprints — no API key, no cost, but it does mean the first call
downloads a small model file (~80MB) if it isn't cached yet.

chromadb.HttpClient talks to the Chroma *server* container over HTTP,
same pattern as connecting to Postgres over a network rather than
embedding a database file directly in the app process.
"""

import chromadb

from ..config import settings

COLLECTION_NAME = "hazards"


def get_chroma_client() -> chromadb.HttpClient:
    return chromadb.HttpClient(host=settings.chroma_host, port=settings.chroma_port)


def get_hazards_collection(client: chromadb.HttpClient):
    # get_or_create so this is safe to call repeatedly / from multiple workers.
    return client.get_or_create_collection(name=COLLECTION_NAME)
