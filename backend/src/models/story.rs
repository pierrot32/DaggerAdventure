use chrono::{DateTime, Utc};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashSet;
use uuid::Uuid;

pub const STORY_STATUSES: &[&str] =
    &["planned", "active", "complete", "dropped"];
pub const MAX_STORY_TITLE_CHARS: usize = 160;
pub const MAX_STORY_DESCRIPTION_CHARS: usize = 5000;
pub const MAX_STORY_POSITION: i32 = 10_000;
pub const MAX_STORY_APPLY_KEY_CHARS: usize = 128;

#[derive(Debug, Deserialize)]
pub struct StoryGoalRequest {
    #[serde(default)]
    pub character_id: Option<Uuid>,
    pub goal_type: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: String,
    pub position: i32,
}

impl StoryGoalRequest {
    pub fn validate(mut self) -> Result<Self, String> {
        self.goal_type = self.goal_type.trim().to_owned();
        self.title = validate_text(
            self.title,
            "Goal title",
            MAX_STORY_TITLE_CHARS,
            false,
        )?;
        self.description = validate_text(
            self.description,
            "Goal description",
            MAX_STORY_DESCRIPTION_CHARS,
            true,
        )?;
        self.status = validate_status(self.status)?;
        if !matches!(self.goal_type.as_str(), "gm" | "player") {
            return Err("Goal type must be gm or player".to_owned());
        }
        validate_position(self.position)
            .then_some(())
            .ok_or_else(|| {
                "Story positions must be between 0 and 10000".to_owned()
            })?;
        Ok(self)
    }
}

#[derive(Debug, Deserialize)]
pub struct StoryMilestoneRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: String,
    pub position: i32,
}

impl StoryMilestoneRequest {
    pub fn validate(mut self) -> Result<Self, String> {
        self.title = validate_text(
            self.title,
            "Milestone title",
            MAX_STORY_TITLE_CHARS,
            false,
        )?;
        self.description = validate_text(
            self.description,
            "Milestone description",
            MAX_STORY_DESCRIPTION_CHARS,
            true,
        )?;
        self.status = validate_status(self.status)?;
        validate_position(self.position)
            .then_some(())
            .ok_or_else(|| {
                "Story positions must be between 0 and 10000".to_owned()
            })?;
        Ok(self)
    }
}

#[derive(Debug, Deserialize)]
pub struct StoryEventRequest {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub status: String,
    pub position: i32,
}

impl StoryEventRequest {
    pub fn validate(mut self) -> Result<Self, String> {
        self.title = validate_text(
            self.title,
            "Event title",
            MAX_STORY_TITLE_CHARS,
            false,
        )?;
        self.description = validate_text(
            self.description,
            "Event description",
            MAX_STORY_DESCRIPTION_CHARS,
            true,
        )?;
        self.status = validate_status(self.status)?;
        validate_position(self.position)
            .then_some(())
            .ok_or_else(|| {
                "Story positions must be between 0 and 10000".to_owned()
            })?;
        Ok(self)
    }
}

#[derive(Debug, Serialize)]
pub struct StoryPlan {
    pub description: Option<String>,
    pub goals: Vec<StoryGoal>,
    pub milestones: Vec<StoryMilestone>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StoryGoal {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub character_id: Option<Uuid>,
    pub character_name: Option<String>,
    pub goal_type: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct StoryMilestone {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub title: String,
    pub description: String,
    pub status: String,
    pub position: i32,
    pub events: Vec<StoryEvent>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StoryEvent {
    pub id: Uuid,
    pub milestone_id: Uuid,
    pub title: String,
    pub description: String,
    pub status: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct GenerateStoryRequest {
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub focus: Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StoryCharacterContext {
    pub id: Uuid,
    pub name: String,
    pub pronouns: String,
    pub description: String,
    pub look_description: String,
    pub class_id: String,
    pub subclass_id: String,
    pub ancestry_id: String,
    pub secondary_ancestry_id: Option<String>,
    pub community_id: String,
    pub background_story: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoryProposalItem {
    pub title: String,
    pub description: String,
    pub status: String,
    #[serde(default)]
    pub character_id: Option<Uuid>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoryProposalMilestone {
    pub title: String,
    pub description: String,
    pub status: String,
    #[serde(default)]
    pub events: Vec<StoryProposalItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StoryProposal {
    pub goal: Option<StoryProposalItem>,
    pub milestones: Vec<StoryProposalMilestone>,
    pub player_goals: Vec<StoryProposalItem>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StoryProposalApplyRequest {
    pub apply_key: String,
    #[serde(default)]
    pub goal: Option<StoryProposalItem>,
    #[serde(default)]
    pub milestones: Vec<StoryProposalMilestone>,
    #[serde(default)]
    pub player_goals: Vec<StoryProposalItem>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoryProposalFields {
    #[serde(default)]
    goal: Option<StoryProposalItem>,
    #[serde(default)]
    milestones: Vec<StoryProposalMilestone>,
    #[serde(default)]
    player_goals: Vec<StoryProposalItem>,
}

impl<'de> Deserialize<'de> for StoryProposal {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let fields = StoryProposalFields::deserialize(deserializer)?;
        let proposal = Self {
            goal: fields.goal,
            milestones: fields.milestones,
            player_goals: fields.player_goals,
        };
        if proposal.is_empty() {
            return Err(serde::de::Error::custom(
                "Story proposal must contain a goal, player goal, or milestone",
            ));
        }
        Ok(proposal)
    }
}

impl StoryProposal {
    fn is_empty(&self) -> bool {
        self.goal.is_none()
            && self.player_goals.is_empty()
            && self.milestones.is_empty()
    }

    pub fn validate_structure(&mut self) -> Result<(), String> {
        if self.is_empty() {
            return Err(
                "Story proposal must contain a goal, player goal, or milestone"
                    .to_owned(),
            );
        }
        if self.milestones.len() > 20 || self.player_goals.len() > 20 {
            return Err("The story proposal contains too many items".to_owned());
        }
        if let Some(goal) = self.goal.as_mut() {
            validate_proposal_item(goal, false)?;
        }
        for goal in &mut self.player_goals {
            validate_proposal_item(goal, true)?;
        }
        for milestone in &mut self.milestones {
            milestone.title = validate_text(
                std::mem::take(&mut milestone.title),
                "Milestone title",
                MAX_STORY_TITLE_CHARS,
                false,
            )?;
            milestone.description = validate_text(
                std::mem::take(&mut milestone.description),
                "Milestone description",
                MAX_STORY_DESCRIPTION_CHARS,
                true,
            )?;
            milestone.status =
                validate_status(std::mem::take(&mut milestone.status))?;
            if milestone.events.len() > 20 {
                return Err("A milestone contains too many events".to_owned());
            }
            for event in &mut milestone.events {
                validate_proposal_item(event, false)?;
            }
        }
        Ok(())
    }

    pub fn validate(
        &mut self,
        character_ids: &HashSet<Uuid>,
    ) -> Result<(), String> {
        self.validate_structure()?;
        for goal in &self.player_goals {
            if goal
                .character_id
                .is_some_and(|id| !character_ids.contains(&id))
            {
                return Err(
                    "A player goal referenced an unavailable character"
                        .to_owned(),
                );
            }
        }
        Ok(())
    }
}

impl StoryProposalApplyRequest {
    pub fn validate(self) -> Result<(String, StoryProposal), String> {
        let apply_key = validate_apply_key(self.apply_key)?;
        let proposal = StoryProposal {
            goal: self.goal,
            milestones: self.milestones,
            player_goals: self.player_goals,
        };
        if proposal.is_empty() {
            return Err(
                "Story proposal must contain a goal, player goal, or milestone"
                    .to_owned(),
            );
        }
        Ok((apply_key, proposal))
    }
}

pub fn validate_apply_key(value: String) -> Result<String, String> {
    if value.is_empty() {
        return Err("Story apply key is required".to_owned());
    }
    if value.chars().count() > MAX_STORY_APPLY_KEY_CHARS {
        return Err(format!(
            "Story apply key must be {MAX_STORY_APPLY_KEY_CHARS} characters or fewer"
        ));
    }
    if !value.chars().all(|character| {
        character.is_ascii_alphanumeric() || matches!(character, '-' | '_')
    }) {
        return Err(
            "Story apply key may contain only letters, numbers, hyphens, and underscores"
                .to_owned(),
        );
    }
    Ok(value)
}

fn validate_proposal_item(
    item: &mut StoryProposalItem,
    require_character: bool,
) -> Result<(), String> {
    item.title = validate_text(
        std::mem::take(&mut item.title),
        "Story item title",
        MAX_STORY_TITLE_CHARS,
        false,
    )?;
    item.description = validate_text(
        std::mem::take(&mut item.description),
        "Story item description",
        MAX_STORY_DESCRIPTION_CHARS,
        true,
    )?;
    item.status = validate_status(std::mem::take(&mut item.status))?;
    if !require_character {
        item.character_id = None;
    }
    Ok(())
}

fn validate_text(
    value: String,
    field: &str,
    max_chars: usize,
    allow_empty: bool,
) -> Result<String, String> {
    let value = value.trim().to_owned();
    if !allow_empty && value.is_empty() {
        return Err(format!("{field} is required"));
    }
    if value.chars().count() > max_chars {
        return Err(format!("{field} must be {max_chars} characters or fewer"));
    }
    Ok(value)
}

fn validate_status(value: String) -> Result<String, String> {
    let value = value.trim().to_owned();
    if STORY_STATUSES.contains(&value.as_str()) {
        Ok(value)
    } else {
        Err("Story status must be planned, active, complete, or dropped"
            .to_owned())
    }
}

fn validate_position(position: i32) -> bool {
    (0..=MAX_STORY_POSITION).contains(&position)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn request_validation_trims_and_allows_empty_descriptions() {
        let request: StoryMilestoneRequest = serde_json::from_value(json!({
            "title": "  The crossing  ",
            "description": "",
            "status": " active ",
            "position": 0
        }))
        .expect("request should deserialize");
        let validated = request.validate().expect("request should validate");
        assert_eq!(validated.title, "The crossing");
        assert_eq!(validated.description, "");
        assert_eq!(validated.status, "active");
    }

    #[test]
    fn request_validation_rejects_bad_status_and_bounds() {
        let bad_status = StoryEventRequest {
            title: "Event".to_owned(),
            description: String::new(),
            status: "paused".to_owned(),
            position: 0,
        };
        assert!(bad_status.validate().is_err());

        let bad_position = StoryEventRequest {
            title: "Event".to_owned(),
            description: String::new(),
            status: "planned".to_owned(),
            position: -1,
        };
        assert!(bad_position.validate().is_err());
    }

    #[test]
    fn proposal_validation_keeps_known_player_character_and_limits_unknown_gm_link()
     {
        let character_id = Uuid::new_v4();
        let mut proposal: StoryProposal = serde_json::from_value(json!({
            "goal": {"title": "Main", "description": "Goal", "status": "planned"},
            "milestones": [],
            "player_goals": [{
                "title": "Hook", "description": "A hook", "status": "planned",
                "character_id": character_id
            }]
        }))
        .expect("proposal should deserialize");
        let mut known = HashSet::new();
        known.insert(character_id);
        proposal.validate(&known).expect("proposal should validate");
        assert_eq!(proposal.player_goals[0].character_id, Some(character_id));

        let unknown_id = Uuid::new_v4();
        proposal.goal.as_mut().expect("goal exists").character_id =
            Some(unknown_id);
        proposal
            .validate(&known)
            .expect("unknown GM links are optional");
        assert_eq!(proposal.goal.expect("goal exists").character_id, None);
    }

    #[test]
    fn proposal_structure_validation_preserves_player_character_hooks() {
        let character_id = Uuid::new_v4();
        let mut proposal: StoryProposal = serde_json::from_value(json!({
            "goal": null,
            "milestones": [],
            "player_goals": [{
                "title": " Hook ",
                "description": " Description ",
                "status": " planned ",
                "character_id": character_id
            }]
        }))
        .expect("proposal should deserialize");

        proposal
            .validate_structure()
            .expect("structure should validate without character membership");
        assert_eq!(proposal.player_goals[0].character_id, Some(character_id));
        assert_eq!(proposal.player_goals[0].title, "Hook");
        assert_eq!(proposal.player_goals[0].status, "planned");
    }

    #[test]
    fn proposal_deserialization_rejects_empty_and_unknown_root_fields() {
        assert!(serde_json::from_value::<StoryProposal>(json!({})).is_err());
        assert!(
            serde_json::from_value::<StoryProposal>(json!({
                "goal": null,
                "milestones": [{
                    "title": "Beat",
                    "description": "Description",
                    "status": "planned",
                    "events": []
                }],
                "player_goals": [],
                "unexpected": true
            }))
            .is_err()
        );
    }

    #[test]
    fn apply_key_validation_accepts_bounded_client_keys() {
        let key = "apply_01-abc".to_owned();
        assert_eq!(validate_apply_key(key.clone()).unwrap(), key);
        assert!(validate_apply_key("".to_owned()).is_err());
        assert!(validate_apply_key("has spaces".to_owned()).is_err());
        assert!(validate_apply_key("has/slash".to_owned()).is_err());
        assert!(
            validate_apply_key("x".repeat(MAX_STORY_APPLY_KEY_CHARS + 1))
                .is_err()
        );
    }

    #[test]
    fn apply_request_rejects_unknown_fields_and_empty_proposals() {
        assert!(
            serde_json::from_value::<StoryProposalApplyRequest>(json!({
                "apply_key": "apply-key"
            }))
            .unwrap()
            .validate()
            .is_err()
        );
        assert!(
            serde_json::from_value::<StoryProposalApplyRequest>(json!({
                "apply_key": "apply-key",
                "unexpected": true
            }))
            .is_err()
        );
    }
}
