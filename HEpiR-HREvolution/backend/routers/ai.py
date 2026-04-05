"""AI router — grading, synthesis, and interview question generation."""

import json
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from services import hrflow, llm

router = APIRouter()

MAGIC_FILENAME = "compte_rendu_julien_roche.pdf"


class GradeRequest(BaseModel):
    job_key: str
    profile_key: str


class SynthesizeRequest(BaseModel):
    job_key: str
    profile_key: str


class AskRequest(BaseModel):
    job_key: str
    profile_key: str


@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribe an audio file and return the text without saving anything."""
    try:
        content = await file.read()
        text = await llm.transcribe_audio(content, file.filename)
        return {"text": text}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/grade")
async def grade_candidate(req: GradeRequest):
    """
    Full grading pipeline:
    1. Fetch HRFlow base score + upskilling data
    2. LLM produces final adjusted score
    """
    try:
        job = await hrflow.get_job(req.job_key)
        profile = await hrflow.get_profile(req.profile_key, use_cache=False)

        is_demo = any(t.get("name") == "is_demo" for t in profile.get("tags", []))

        existing_tag = hrflow.extract_tag(profile, f"job_data_{req.job_key}")
        existing = json.loads(existing_tag) if existing_tag else {}
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)
        existing_synth_raw = hrflow.extract_tag(profile, f"synthesis_{req.job_key}")
        synthesis_data = json.loads(existing_synth_raw) if existing_synth_raw else None

        # 1. GESTION DU SCORE DE BASE
        if is_demo:
            base_score = 0.85
        else:
            cached_base = existing.get("base_score")
            if cached_base is not None:
                base_score = cached_base
            else:
                base_score = await hrflow.get_profile_score(req.job_key, req.profile_key) or 0.0
                await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
                    **existing, "job_key": req.job_key, "base_score": base_score
                }))

        # 2. NOTATION DES DOCUMENTS (Génère le delta et le résumé UI)
        if extra_docs:
            already_scored = [d for d in extra_docs if d.get("delta") is not None]
            to_score = [d for d in extra_docs if d.get("delta") is None]
            newly_scored = []
            
            for doc in to_score:
                if is_demo and doc.get("filename", "").lower() == MAGIC_FILENAME.lower():
                    newly_scored.append({
                        **doc, 
                        "delta": 0.06, 
                        "delta_rationale": "Le compte-rendu confirme la maîtrise de Python et de TypeScript, comblant ainsi deux faiblesses précédemment identifiées."
                    })
                else:
                    # Pour TOUT AUTRE document (même pour Joris), on utilise le vrai LLM !
                    other_docs = [d for d in extra_docs if d["id"] != doc["id"]]

                    current_ai_adj = sum([d.get("delta", 0) for d in already_scored]) + sum([d.get("delta", 0) for d in newly_scored])
                    current_total_score = min(1.0, max(0.0, base_score + current_ai_adj))
                    
                    score_result = await llm.score_single_document(job, profile, doc, other_docs, synthesis_data, current_total_score)
                    newly_scored.append({**doc, "delta": score_result["delta"], "delta_rationale": score_result["rationale"]})

            if newly_scored:
                await hrflow.update_documents_with_deltas(req.profile_key, req.job_key, newly_scored)
            
            all_deltas = [d["delta"] for d in already_scored] + [d["delta"] for d in newly_scored]
            
            ai_adjustment = round(sum(all_deltas), 3)

            newly_by_id = {d["id"]: d for d in newly_scored}
            scored_documents = [
                {**d, "delta": newly_by_id[d["id"]]["delta"], "delta_rationale": newly_by_id[d["id"]]["delta_rationale"]}
                if d["id"] in newly_by_id else d
                for d in extra_docs
            ]
        else:
            ai_adjustment = 0.0
            scored_documents = []

        # 3. SAUVEGARDE ET RÉPONSE
        profile = await hrflow.get_profile(req.profile_key)
        await _patch_tag(req.profile_key, profile, f"job_data_{req.job_key}", json.dumps({
            "job_key": req.job_key,
            "base_score": base_score,
            "ai_adjustment": ai_adjustment,
            "bonus": existing.get("bonus", 0.0),
        }))
        hrflow._invalidate_job_candidates(req.job_key)

        return {
            "base_score": base_score,
            "ai_adjustment": ai_adjustment,
            "documents": scored_documents,
        }
    except Exception as e:
        print(f"grade error: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))



@router.get("/synthesis")
async def get_synthesis(job_key: str, profile_key: str):
    """Return the stored synthesis for a candidate, or null if not yet generated."""
    try:
        profile = await hrflow.get_profile(profile_key)
        raw = hrflow.extract_tag(profile, f"synthesis_{job_key}")
        return json.loads(raw) if raw else None
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/synthesize")
async def synthesize_candidate(req: SynthesizeRequest):
    """Manually (re-)generate and store a synthesis for a candidate."""
    try:
        job, profile, tracking = await _fetch_context(req.job_key, req.profile_key)

        is_demo = any(t.get("name") == "is_demo" for t in profile.get("tags", []))
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)
        if is_demo:
            last_doc = extra_docs[-1] if extra_docs else None
            
            if not last_doc:
                # 1. Aucun document -> Synthèse de base Joris
                synthesis = {
                    "summary": "Julien Roche possède un profil fullstack solide, avec une maîtrise de JavaScript, React, Docker et des pratiques CI/CD, ainsi qu'une expérience en méthodes Agiles et en développement SaaS. Cependant, il manque d'expérience explicite en Python, en TypeScript et en tests avec Pytest, ainsi qu'une connaissance du secteur RH. Pour renforcer sa candidature, il devrait se former à ces technologies et acquérir des connaissances du domaine des ressources humaines.",
                    "strengths": ["Maîtrise de JavaScript et React", "Expérience avec Docker et CI/CD", "Connaissance des méthodes Agiles", "Fullstack confirmé avec expérience SaaS", "Compétences en UI/UX et design moderne"],
                    "weaknesses": ["Pas d'expérience explicite en Python", "Absence de mention de TypeScript", "Manque d'expérience avec Pytest", "Manque de connaissance du secteur RH"],
                    "upskilling": ["Se former à Python pour le back-end", "Apprendre TypeScript", "Approfondir les tests Pytest", "Se former au secteur RH"],
                    "verdict": "strong_yes"
                }
                await _patch_tag(req.profile_key, profile, f"synthesis_{req.job_key}", json.dumps(synthesis))
                return synthesis
            
            elif last_doc.get("filename", "").lower() == MAGIC_FILENAME.lower():
                # 2. Le DERNIER document est le document magique -> Synthèse modifiée
                synthesis = {
                    "summary": "Julien Roche montre une excellente maîtrise du fullstack, avec JavaScript, React, Node.js et des compétences DevOps validées. Les tests ont confirmé ses compétences en Python et TypeScript, comblant les lacunes précédentes. Seuls le manque d'expérience sur Pytest et la méconnaissance du secteur RH reste à développer, mais sa capacité d'adaptation est forte.",
                    "strengths": ["Maîtrise de JavaScript et React", "Expérience avec Docker et CI/CD", "Connaissance des méthodes Agiles", "Fullstack confirmé avec expérience SaaS", "Compétences en UI/UX et design moderne", "Maîtrise de Python confirmée", "Bases solides en TypeScript"],
                    "weaknesses": ["Manque d'expérience avec Pytest", "Manque de connaissance du secteur RH"],
                    "upskilling": ["Approfondir les tests Pytest", "Se former au secteur RH"],
                    "verdict": "strong_yes"
                }
                await _patch_tag(req.profile_key, profile, f"synthesis_{req.job_key}", json.dumps(synthesis))
                return synthesis

        try:
            upskilling = await hrflow.get_job_upskilling(req.job_key, req.profile_key)
        except Exception as ue:
            print(f"upskilling fetch failed (non-fatal): {ue}", flush=True)
            upskilling = {}

        raw_tag = hrflow.extract_tag(profile, f"job_data_{req.job_key}")
        final_score = json.loads(raw_tag).get("score", 0.5) if raw_tag else 0.5
        extra_docs = hrflow.get_extra_documents(profile, req.job_key)

        existing_synth_raw = hrflow.extract_tag(profile, f"synthesis_{req.job_key}")
        existing_synthesis = None
        if existing_synth_raw:
            try:
                existing_synthesis = json.loads(existing_synth_raw)
            except Exception:
                pass

        synthesis = None
        last_err = None
        for attempt in range(2):
            try:
                synthesis = await llm.synthesize_candidate(
                    job, profile, tracking or {}, upskilling, final_score, extra_docs, existing_synthesis
                )
                if synthesis and isinstance(synthesis, dict) and synthesis.get("summary"):
                    break
            except Exception as e:
                last_err = e
                print(f"[synthesize] attempt {attempt+1} failed: {e}", flush=True)

        if synthesis and isinstance(synthesis, dict) and synthesis.get("summary"):
            await _patch_tag(req.profile_key, profile, f"synthesis_{req.job_key}", json.dumps(synthesis))
            return synthesis
        
        # Fallback to existing synthesis if generation failed
        existing_synth_raw = hrflow.extract_tag(profile, f"synthesis_{req.job_key}")
        if existing_synth_raw:
            print("[synthesize] generation failed, falling back to existing synthesis", flush=True)
            return json.loads(existing_synth_raw)
            
        raise last_err or Exception("Synthesis generation failed and no existing synthesis found")
    except Exception as e:
        print(f"synthesize error: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))


@router.post("/ask")
async def ask_questions(req: AskRequest):
    """Generate tailored interview questions for a candidate."""
    try:
        job, profile, _ = await _fetch_context(req.job_key, req.profile_key)
        
        is_demo = any(t.get("name") == "is_demo" for t in profile.get("tags", []))
        if is_demo:
            return {
                "questions": [
                    {
                    "category": "Technique",
                    "question": "Sur votre expérience de 2019 en SaaS, comment avez-vous architecturé la gestion des états complexes avec Redux Toolkit pour la plateforme de gestion locative ?"
                    },
                    {
                    "category": "Technique",
                    "question": "Vous mentionnez l'utilisation de Docker et AWS (EC2/S3) dans vos compétences. Comment avez-vous structuré vos pipelines CI/CD avec GitHub Actions pour déployer vos applications ?"
                    },
                    {
                    "category": "Technique",
                    "question": "Pour la partie Backend, vous listez SQL/PostgreSQL et NoSQL/MongoDB. Selon quels critères choisissez-vous d'utiliser l'un ou l'autre sur un nouveau projet ?"
                    },
                    {
                    "category": "Technique",
                    "question": "Vous mentionnez Jest dans vos compétences. Quelle est votre stratégie pour maintenir une bonne couverture de tests sur une API REST construite avec Express ?"
                    },
                    {
                    "category": "Technique",
                    "question": "Lors de votre expérience de développeur junior, vous avez intégré des normes d'accessibilité web. Comment assurez-vous aujourd'hui le respect de ces normes lors de la création de composants complexes avec React et Tailwind CSS ?"
                    },
                    {
                    "category": "Motivation",
                    "question": "Qu'est-ce qui vous motive aujourd'hui à quitter le secteur de la gestion locative pour rejoindre notre projet ?"
                    },
                    {
                    "category": "Comportemental",
                    "question": "Lors de votre passage de développeur junior à des projets d'architecture SaaS plus complexes, comment avez-vous géré la montée en compétences sur des sujets d'automatisation ?"
                    },
                    {
                    "category": "Comportemental",
                    "question": "Travailler sur du SaaS implique souvent des compromis entre la vitesse de livraison et la dette technique. Pouvez-vous nous parler d'un moment où vous avez dû gérer cette balance en équipe ?"
                    }
                ]
                }

        extra_docs = hrflow.get_extra_documents(profile, req.job_key)
        questions = await llm.generate_questions(job, profile, extra_docs)
        return questions
    except Exception as e:
        print(f"ask error: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _fetch_context(job_key: str, profile_key: str):
    job = await hrflow.get_job(job_key)
    profile = await hrflow.get_profile(profile_key)
    tracking = await hrflow.get_tracking(job_key, profile_key)
    return job, profile, tracking


async def _patch_tag(profile_key: str, profile: dict, tag_name: str, tag_value: str):
    existing = [t for t in profile.get("tags", []) if t.get("name") != tag_name]
    await hrflow.patch_profile_tags(profile_key, existing + [{"name": tag_name, "value": tag_value}])
