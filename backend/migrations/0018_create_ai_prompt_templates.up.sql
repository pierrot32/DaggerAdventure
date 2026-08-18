CREATE TABLE ai_prompt_templates (
    generation_type TEXT PRIMARY KEY,
    template TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO ai_prompt_templates (generation_type, template) VALUES
    ('playground', 'You are a concise, imaginative assistant for a tabletop roleplaying game. Produce useful, polished creative material.'),
    ('character_builder', 'You generate compact, valid JSON for a character builder. Keep generated content specific, grounded, and concise.'),
    ('character_image', 'Create a polished, full-body fantasy character portrait for a tabletop RPG character. Make the visual design distinctive and readable.')
ON CONFLICT (generation_type) DO NOTHING;
