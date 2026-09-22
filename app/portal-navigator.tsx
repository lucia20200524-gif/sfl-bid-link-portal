"use client";

import { useEffect, useId, useState } from "react";
import { ArrowRight, ChevronDown } from "lucide-react";
import { portalGuide, type GuideContext, type GuideTarget } from "@/lib/portal-guide";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const characters = [
  { id: "female", label: "女性", name: "SFLナビ", image: "/sfl-anime-navigator.png" },
  { id: "male", label: "男性", name: "男性ナビ", image: "/sfl-male-navigator.png" },
] as const;
export { characters as navigatorCharacters };
const characterStorageKey = "sfl.navigator.character.v1";

export default function PortalNavigator({ context, onNavigate }: { context: GuideContext; onNavigate: (target: GuideTarget) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [characterId, setCharacterId] = useState<string>("male");
  const pickerId = useId();
  useEffect(() => {
    let selected = "male";
    try {
      const saved = localStorage.getItem(characterStorageKey);
      if (characters.some(c => c.id === saved)) selected = saved!;
      else if (saved) localStorage.setItem(characterStorageKey, selected);
    } catch { /* This device may disable preference storage. */ }
    setCharacterId(selected);
    document.documentElement.dataset.navigatorTheme = selected;
  }, []);
  const character = characters.find(c => c.id === characterId) ?? characters[1];
  const guide = portalGuide(context);
  return <section className="navigator-panel" aria-label="ポータルの案内"><details className="portal-navigator" data-guide-state={guide.state} open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="navigator-summary">
      <span className="navigator-portrait"><img src={character.image} alt={`${character.label}の案内キャラクター`} width={1254} height={1254}/></span>
      <span className="navigator-message">
        <span className="navigator-label">案内ナビゲーター <strong>{character.name}</strong></span>
        <strong className="navigator-title">{guide.title}</strong>
        <span className="navigator-description">{guide.message}</span>
      </span>
      <span className="navigator-toggle">{expanded ? "案内を閉じる" : "使い方を見る"}<ChevronDown size={18} aria-hidden="true"/></span>
    </summary>
    <div className="navigator-detail">
      <ol className="navigator-steps">{guide.steps.map((step, index) => <li key={step.title}>
        <span className="navigator-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <div><h2>{step.title}</h2><p>{step.text}</p>{step.action && <button type="button" className="text-button" onClick={() => { setExpanded(false); onNavigate(step.action!.target); }}>{step.action.label}<ArrowRight size={17}/></button>}</div>
      </li>)}</ol>
    </div>
  </details>
    <div className="navigator-character-picker">
      <span id={`${pickerId}-label`}>案内役・配色を選ぶ</span>
      <RadioGroup aria-labelledby={`${pickerId}-label`} className="navigator-character-options" value={characterId} onValueChange={value => {
        if (!characters.some(c => c.id === value)) return;
        setCharacterId(value); document.documentElement.dataset.navigatorTheme = value;
        try { localStorage.setItem(characterStorageKey, value); } catch { /* Selection still works without storage. */ }
      }}>
        {characters.map(option => <label key={option.id} htmlFor={`${pickerId}-${option.id}`} className="navigator-character-option" data-selected={characterId === option.id}>
          <RadioGroupItem id={`${pickerId}-${option.id}`} value={option.id} aria-label={option.label}/>
          <img src={option.image} alt="" width={48} height={48}/><span>{option.label}</span>
        </label>)}
      </RadioGroup>
    </div>
  </section>;
}
