// Guides: lists of steps with why they matter, ticked off from the account's data or by hand.
//
// A guide has { id, name, blurb, stages, steps, categories? }. Each step has:
//   id, stage, title, why, wiki (page name, defaults to the title), category (optional)
//   done      checks that mean the step is complete (ticked automatically when all are met)
//   requires  checks you need before you can do it (shows the step as Ready)
// Check types:
//   { skill, level }            skill at or above a level
//   { quest }                   quest complete
//   { quest, started: true }    quest started or complete
//   { diary, tier }             achievement diary tier complete
//   { item }                    item ticked off on your collection log list
//   { kc, count }               boss kill count at least count (hiscores or Dink)
//   { points }                  at least this many Slayer points
//   { combat }                  combat level at or above
// Any check can have a label to show instead of the default one.
// A step with no done checks, or one you've done some other way, can be ticked by hand.
import { iron } from './iron.js';
import { diaries } from './diaries.js';
import { skills } from './skills.js';
import { bosses } from './bosses.js';
import { slayer } from './slayer.js';
import { money } from './money.js';
import { farming } from './farming.js';

// The quest order guide's steps come from the wiki's ironman quest route (see questRoute.js).
export const quests = {
  id: 'quests',
  name: 'Quest order',
  blurb: 'The OSRS Wiki\'s ironman quest route: every quest in order, with the training, diaries and unlocks along the way, and the wiki\'s notes for each step.',
  categories: [['quest', 'Quests'], ['skill', 'Training'], ['diary', 'Diaries'], ['unlock', 'Unlocks']],
  stages: [{ id: 'route', name: 'Route' }],
  steps: [],
  fromWiki: true,
};

export const GUIDES = [iron, quests, diaries, skills, bosses, slayer, money, farming];
export const guideById = (id) => GUIDES.find((g) => g.id === id);

// Manual ticks are stored per step; the iron guide's ids predate the other guides, so they have no prefix.
export const progressId = (guide, stepId) => (guide.id === 'iron' ? stepId : `${guide.id}:${stepId}`);

function defaultLabel(c) {
  if (c.skill) return `${c.level} ${c.skill}`;
  if (c.quest) return c.started ? `Start ${c.quest}` : c.quest;
  if (c.diary) return `${c.diary} ${c.tier} diary`;
  if (c.item) return c.item;
  if (c.kc) return c.count > 1 ? `${c.count} ${c.kc} kills` : `Kill ${c.kc}`;
  if (c.points) return `${c.points} Slayer points`;
  if (c.combat) return `${c.combat} combat`;
  return '?';
}

function isMet(c, ctx) {
  if (c.skill) return (ctx.levels[c.skill] ?? 1) >= c.level;
  if (c.quest) {
    const state = ctx.questStates[c.quest.toLowerCase()];
    return state === 'complete' || (Boolean(c.started) && state === 'in_progress');
  }
  if (c.diary) return Boolean(ctx.diaries[c.diary]?.[c.tier]);
  if (c.item) return ctx.obtained.has(c.item.toLowerCase());
  if (c.kc) return (ctx.kc?.[c.kc.toLowerCase()] ?? 0) >= (c.count ?? 1);
  if (c.points) return (ctx.slayerPoints ?? 0) >= c.points;
  if (c.combat) return (ctx.combatLevel ?? 3) >= c.combat;
  return false;
}

export function evaluateCheck(c, ctx) {
  return { ...c, label: c.label || defaultLabel(c), met: isMet(c, ctx) };
}

// ctx: { levels, questStates (lower-case names), diaries, obtained (Set of lower-case item names), kc (lower-case boss names),
//        slayerPoints, combatLevel, manual (Set of step ids) }
// questRequirements (optional): step -> extra checks from the wiki, added to quest steps' requirements.
export function evaluateStep(step, ctx) {
  const extra = ctx.questRequirements?.(step) || [];
  const requires = [...(step.requires || []).map((c) => evaluateCheck(c, ctx)), ...extra];
  const done = (step.done || []).map((c) => evaluateCheck(c, ctx));
  const autoDone = done.length > 0 && done.every((c) => c.met);
  const manual = ctx.manual.has(step.id);
  // "Ready" only when there are requirements and they're all met; otherwise it's just something to do.
  const status = autoDone || manual ? 'done' : !requires.length ? 'todo' : requires.every((c) => c.met) ? 'ready' : 'locked';
  return { requires, done, status, auto: autoDone, manual };
}
