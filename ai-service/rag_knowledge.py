import os
import json
import logging
import re
from typing import List, Dict, Optional, Any
from datetime import datetime

logger = logging.getLogger("hydrosense.rag")

try:
    import chromadb
    HAS_CHROMA = True
except ImportError:
    HAS_CHROMA = False
    logger.warning("chromadb not installed — RAG knowledge base unavailable")


class EmbeddingService:
    """Generates embeddings using Gemini embedding API or fallback."""

    EMBEDDING_URL = "https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent"

    def __init__(self):
        self._cache: Dict[str, List[float]] = {}
        self._http_client = None

    async def embed(self, text: str) -> List[float]:
        cache_key = text[:200].lower()
        cached = self._cache.get(cache_key)
        if cached:
            return cached

        api_key = os.getenv("GEMINI_API_KEY", "").strip()
        if api_key:
            try:
                import httpx
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.post(
                        f"{self.EMBEDDING_URL}?key={api_key}",
                        json={"content": {"parts": [{"text": text[:3072}]}},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        values = data["embedding"]["values"]
                        self._cache[cache_key] = values
                        if len(self._cache) > 500:
                            self._cache.clear()
                        return values
            except Exception as e:
                logger.warning(f"Gemini embedding failed: {e}")

        return self._fallback_embed(text)

    def _fallback_embed(self, text: str) -> List[float]:
        words = re.findall(r'\w+', text.lower())
        vec = [0.0] * 128
        for i, w in enumerate(set(words)):
            h = hash(w + str(i))
            idx = abs(h) % 128
            vec[idx] += (h % 100) / 100.0
        magnitude = sum(v * v for v in vec) ** 0.5
        if magnitude > 0:
            vec = [v / magnitude for v in vec]
        return vec


class HydroKnowledgeBase:
    """Vector knowledge base using ChromaDB for HydroSense documentation and data."""

    def __init__(self, persist_dir: str = "./chroma_db"):
        self.persist_dir = persist_dir
        self.embedder = EmbeddingService()
        self._collection = None
        self._initialized = False

    async def initialize(self):
        if self._initialized:
            return
        if not HAS_CHROMA:
            logger.warning("ChromaDB not available — RAG will be disabled")
            self._initialized = True
            return
        try:
            os.makedirs(self.persist_dir, exist_ok=True)
            client = chromadb.PersistentClient(path=self.persist_dir)
            self._collection = client.get_or_create_collection(
                name="hydrosense_knowledge",
                metadata={"hnsw:space": "cosine"},
            )
            self._initialized = True
            count = self._collection.count()
            logger.info(f"RAG Knowledge Base initialized — {count} documents indexed")
        except Exception as e:
            logger.error(f"Failed to initialize ChromaDB: {e}")

    async def add_document(self, doc_id: str, text: str, metadata: Optional[Dict[str, Any]] = None):
        if not HAS_CHROMA or self._collection is None:
            return
        try:
            embedding = await self.embedder.embed(text[:3072])
            self._collection.add(
                embeddings=[embedding],
                documents=[text],
                metadatas=[metadata or {"added_at": datetime.utcnow().isoformat()}],
                ids=[doc_id],
            )
        except Exception as e:
            logger.error(f"Failed to add document {doc_id}: {e}")

    async def add_documents(self, documents: List[Dict[str, Any]]):
        if not HAS_CHROMA or self._collection is None or not documents:
            return
        try:
            texts = [d["text"][:3072] for d in documents]
            embeddings = []
            for t in texts:
                emb = await self.embedder.embed(t)
                embeddings.append(emb)
            self._collection.add(
                embeddings=embeddings,
                documents=texts,
                metadatas=[d.get("metadata", {}) for d in documents],
                ids=[d["id"] for d in documents],
            )
        except Exception as e:
            logger.error(f"Failed to add documents: {e}")

    async def search(self, query: str, n_results: int = 5) -> List[Dict[str, Any]]:
        if not HAS_CHROMA or self._collection is None:
            return []
        try:
            embedding = await self.embedder.embed(query[:3072])
            results = self._collection.query(
                query_embeddings=[embedding],
                n_results=min(n_results, 20),
            )
            documents = []
            if results["documents"] and results["documents"][0]:
                for i, doc in enumerate(results["documents"][0]):
                    documents.append({
                        "text": doc,
                        "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                        "distance": results["distances"][0][i] if results["distances"] else 0,
                    })
            return documents
        except Exception as e:
            logger.error(f"RAG search failed: {e}")
            return []

    async def index_hydrosense_knowledge(self):
        """Index built-in HydroSense knowledge into the vector store."""
        if not HAS_CHROMA or self._collection is None:
            return
        if self._collection.count() > 0:
            return

        knowledge_base = [
            {
                "id": "intro",
                "text": "HydroSense is Uganda's national climate-resilient rural water management platform. "
                        "It integrates IoT sensor monitoring, AI-powered climate forecasting, community-driven "
                        "governance, and real-time alerting across 15 districts. The platform is operated by "
                        "the Ministry of Water & Environment (MWE) Uganda.",
                "metadata": {"category": "general", "type": "system_overview"},
            },
            {
                "id": "water_points",
                "text": "HydroSense monitors 51+ water points including boreholes, protected springs, "
                        "rainwater harvesting systems, piped water schemes, and shallow wells. Each water point "
                        "tracks status (functional/non-functional), GPS location, yield (L/min), beneficiaries served, "
                        "infrastructure score, installation date, and maintenance history.",
                "metadata": {"category": "infrastructure", "type": "water_points"},
            },
            {
                "id": "sensors",
                "text": "IoT sensors on HydroSense include: flow rate sensors (L/min), water level sensors (m), "
                        "rainfall gauges (mm), water quality sensors (pH, turbidity, EC, TDS), solar power monitors "
                        "(voltage, current), and pressure sensors. Data streams update every 30 seconds via LoRaWAN "
                        "and cellular networks. Sensors have battery level monitoring and offline detection.",
                "metadata": {"category": "infrastructure", "type": "sensors"},
            },
            {
                "id": "alerts",
                "text": "HydroSense alert system has 4 severity levels: info, warning, high, critical. "
                        "Alerts are generated for: water point failures, contamination events, sensor anomalies, "
                        "drought warnings, flood risks, maintenance overdue, and health incident correlations. "
                        "Alerts can be acknowledged and resolved through the Emergency Response module.",
                "metadata": {"category": "operations", "type": "alerts"},
            },
            {
                "id": "maintenance",
                "text": "Maintenance requests in HydroSense track repair status through stages: pending, "
                        "assigned, in_progress, completed. Each request has priority (low, medium, high, critical), "
                        "assigned technician, estimated cost, completion notes, and spare parts used. "
                        "Technicians get auto-assigned based on district and workload.",
                "metadata": {"category": "operations", "type": "maintenance"},
            },
            {
                "id": "water_quality",
                "text": "Water quality testing in HydroSense follows WHO guidelines. Parameters include: "
                        "pH (6.5-8.5), turbidity (<5 NTU), conductivity, total dissolved solids (TDS), "
                        "E.coli (0 CFU/100mL), chlorine residual, temperature, and overall safety score (0-100). "
                        "Tests are geotagged and linked to specific water points.",
                "metadata": {"category": "quality", "type": "water_quality"},
            },
            {
                "id": "climate",
                "text": "HydroSense climate monitoring includes: drought index (SPI - Standardised Precipitation Index), "
                        "rainfall forecasts, temperature trends, flood risk assessment, and 6-month climate outlooks. "
                        "AI models predict drought conditions, water availability, and infrastructure failure risk "
                        "based on climate patterns.",
                "metadata": {"category": "climate", "type": "climate_forecasting"},
            },
            {
                "id": "health",
                "text": "HydroSense health surveillance tracks waterborne disease outbreaks including cholera, "
                        "typhoid, diarrhea, and dysentery. It correlates health incident locations with water quality "
                        "test results to identify contamination sources. Outbreak status tracking: active, "
                        "contained, resolved. Cases are reported per incident.",
                "metadata": {"category": "health", "type": "health_surveillance"},
            },
            {
                "id": "governance",
                "text": "HydroSense governance module manages Water User Committees (WUCs), budget allocations, "
                        "district performance dashboards, transparency reports, and compliance tracking for MWE. "
                        "Roles include: national_admin, district_officer, technician, health_officer, "
                        "climate_scientist, ngo_officer, community_committee, and citizen.",
                "metadata": {"category": "governance", "type": "governance"},
            },
            {
                "id": "community",
                "text": "Citizens can report water issues through HydroSense via multiple channels: mobile app, "
                        "SMS, WhatsApp, USSD, and web interface. Reports can include photos, voice recordings, "
                        "and GPS coordinates. The AI analyzes reports in 10 Ugandan languages and auto-assigns "
                        "them to the appropriate district officer.",
                "metadata": {"category": "community", "type": "citizen_reports"},
            },
            {
                "id": "predictions",
                "text": "HydroSense AI prediction engine provides: water failure prediction (30-day risk), "
                        "maintenance forecasting (identifies points needing service), contamination risk scoring, "
                        "sensor anomaly detection, and 6-month climate forecasting. Predictions use historical "
                        "data, sensor trends, weather patterns, and infrastructure condition scores.",
                "metadata": {"category": "analytics", "type": "predictions"},
            },
            {
                "id": "budget",
                "text": "HydroSense budget tracking manages allocations for water infrastructure projects. "
                        "Tracks: total allocated funds, expenditure by district, funding source (government, donor, NGO), "
                        "project status, and disbursement schedules. Supports Uganda's MWE reporting requirements "
                        "and SDG 6 financing commitments.",
                "metadata": {"category": "governance", "type": "budget"},
            },
            {
                "id": "roles",
                "text": "HydroSense role-based access control: national_admin (system-wide access), "
                        "district_officer (district-level operations), technician (field repairs, sensor data), "
                        "health_officer (water quality, health data), climate_scientist (climate analytics), "
                        "ngo_officer (NGO partner access), community_committee (local oversight), "
                        "citizen (report issues, track requests, community features).",
                "metadata": {"category": "general", "type": "roles"},
            },
            {
                "id": "multilingual",
                "text": "HydroSense supports 10 languages: English, Luganda, Runyankole, Ateso, Luo, "
                        "Lugbara, Lusoga, Rukiga, Acholi, and Swahili. The AI detects the user's language "
                        "and responds in the same language. Citizen reports can be submitted in any supported "
                        "language and are analyzed by AI for severity and appropriate routing.",
                "metadata": {"category": "general", "type": "multilingual"},
            },
            {
                "id": "sdg6",
                "text": "HydroSense directly supports UN Sustainable Development Goal 6 (Clean Water and Sanitation). "
                        "SDG 6 targets include: 6.1 (safe drinking water), 6.2 (sanitation and hygiene), "
                        "6.3 (water quality), 6.4 (water-use efficiency), 6.5 (water resource management), "
                        "6.6 (water ecosystems), 6.a (international cooperation), and 6.b (community participation). "
                        "Uganda's national target is 85% rural water access by 2030.",
                "metadata": {"category": "general", "type": "sdg6"},
            },
        ]

        await self.add_documents(knowledge_base)
        logger.info(f"Indexed {len(knowledge_base)} knowledge documents into RAG")


rag_kb = HydroKnowledgeBase()
