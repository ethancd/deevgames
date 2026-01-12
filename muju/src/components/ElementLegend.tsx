import { ELEMENT_INFO } from '../game/elements';

export function ElementLegend() {
  return (
    <div className="p-2 bg-gray-800 rounded border border-gray-700 text-xs">
      <div className="text-gray-400 mb-2 font-medium">Element Advantages (+1 ATK)</div>

      {/* Double-thick triangle: F&L → P&M → W&S → F&L */}
      <div className="space-y-1">
        <div className="flex items-center gap-1 flex-wrap">
          <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
          <span className="text-gray-500 mx-1">→</span>
          <span style={{ color: ELEMENT_INFO.plant.color }}>Plant</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.metal.color }}>Metal</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span style={{ color: ELEMENT_INFO.plant.color }}>Plant</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.metal.color }}>Metal</span>
          <span className="text-gray-500 mx-1">→</span>
          <span style={{ color: ELEMENT_INFO.water.color }}>Water</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.shadow.color }}>Shadow</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <span style={{ color: ELEMENT_INFO.water.color }}>Water</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.shadow.color }}>Shadow</span>
          <span className="text-gray-500 mx-1">→</span>
          <span style={{ color: ELEMENT_INFO.fire.color }}>Fire</span>
          <span className="text-gray-600">&</span>
          <span style={{ color: ELEMENT_INFO.lightning.color }}>Lightning</span>
        </div>
      </div>
    </div>
  );
}
