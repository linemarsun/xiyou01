/** 开局界面：取名号 → 选门派职业 → 选宠物 → 开始冒险（存档时另有「继续冒险」） */
import { CLASSES, PETS, SKILLS } from '../core/content';
import type { ClassDef, PetDef, Resists } from '../core/types';
import { h } from './dom';

export interface SetupResult {
  classId: string;
  petId: string;
  playerName: string;
}

const RESIST_NAMES: Record<keyof Resists, string> = {
  chaos: '混', sleep: '睡', seal: '封', forget: '忘', poison: '毒',
  fire: '火', water: '水', wind: '风', thunder: '雷',
};

function resistSummary(res: Resists): string {
  return (Object.keys(RESIST_NAMES) as Array<keyof Resists>)
    .map((k) => `${RESIST_NAMES[k]}${res[k]}`)
    .join(' ');
}

export interface SetupHandlers {
  onStart: (r: SetupResult) => void;
  hasSave?: boolean;
  onContinue?: () => void;
}

export function renderSetup(root: HTMLElement, handlers: SetupHandlers): void {
  const { onStart, hasSave, onContinue } = handlers;
  root.innerHTML = '';
  let selClass: ClassDef = CLASSES[0];
  let selPet: PetDef = PETS[0];

  const classGrid = h('div', { class: 'card-grid' });
  const petGrid = h('div', { class: 'card-grid' });

  const buildCard = <T extends { id: string; emoji: string; name: string; desc: string }>(
    item: T & { skillIds: string[]; resists: Resists },
    extra: string,
    grid: HTMLElement,
    onPick: () => void,
  ): HTMLElement => {
    const card = h(
      'div',
      {
        class: 'pick-card selected',
        title: `抗性：${resistSummary(item.resists)}`,
        onclick: () => {
          for (const c of Array.from(grid.children)) c.classList.remove('selected');
          card.classList.add('selected');
          onPick();
        },
      },
      h('div', { class: 'pick-emoji' }, item.emoji),
      h('div', { class: 'pick-name' }, item.name, h('span', { class: 'race' }, extra)),
      h('div', { class: 'pick-desc' }, item.desc),
      h('div', { class: 'pick-skills' }, item.skillIds.map((id) => SKILLS[id]?.name ?? id).join(' · ')),
    );
    grid.append(card);
    return card;
  };

  for (const c of CLASSES) {
    buildCard(c, `${c.race} · ${c.sect}`, classGrid, () => { selClass = c; });
  }
  for (const p of PETS) {
    buildCard(p, '宠物', petGrid, () => { selPet = p; });
  }

  const nameInput = h('input', {
    class: 'name-input',
    maxlength: 8,
    value: '无名少侠',
    placeholder: '取个名号（最多8字）',
  }) as HTMLInputElement;

  const startBtn = h('button', {
    class: 'btn primary big',
    onclick: () => {
      onStart({
        classId: selClass.id,
        petId: selPet.id,
        playerName: (nameInput.value || '无名少侠').trim(),
      });
    },
  }, '开 始 冒 险');

  root.append(
    h('div', { class: 'setup' },
      h('h1', { class: 'game-title' }, '山 海 奇 谭'),
      h('div', { class: 'game-sub' }, '回合制 RPG · M2 大地图探索'),
      hasSave && onContinue
        ? h('div', { style: 'margin-bottom:10px' },
            h('button', { class: 'btn primary big', onclick: () => onContinue() }, '继 续 冒 险'),
            h('div', { class: 'game-foot' }, '↑ 读取上次进度（新开一局会覆盖存档）'),
          )
        : '',
      h('div', { class: 'sec-label' }, '① 名号'), nameInput,
      h('div', { class: 'sec-label' }, '② 选择门派职业'), classGrid,
      h('div', { class: 'sec-label' }, '③ 选择宠物'), petGrid,
      h('div', { class: 'sec-label' }), startBtn,
      h('div', { class: 'game-foot' }, '提示：数值可在 src/core/content.ts 中调整；地址栏加 #sim 可跑批量数值仿真'),
    ),
  );
}
