import { ELEMENT_INFO } from '../game/elements';

export function ElementLegend() {
  return (
    <div className="p-2 bg-gray-800 rounded border border-gray-700 text-xs">
      <div className="text-gray-400 mb-2 font-medium">Element Advantages (+1 ATK)</div>

      {/* Triangle 1: Fire → Plant → Water → Fire */}
      <div className="flex items-center gap-1 mb-1">
        <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.plant.color }}>Plant</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.water.color }}>Water</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
      </div>

      {/* Triangle 2: Lightning → Metal → Wind → Lightning */}
      <div className="flex items-center gap-1">
        <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.metal.color }}>Metal</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.wind.color }}>Wind</span>
        <span className="text-gray-500">→</span>
        <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
      </div>
    </div>
  );
}
