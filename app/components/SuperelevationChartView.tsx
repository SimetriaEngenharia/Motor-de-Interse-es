import React, { useMemo } from 'react';
import { useStore } from '../store';
import { SuperelevationChart } from '../superelevation/components/SuperelevationChart';
import { createDefaultDataFromAlignment } from '../superelevation/SuperelevationPanel';
import { SuperPoint } from '../superelevation/types';

export function SuperelevationChartView() {
  const store = useStore();
  const alignmentId = store.activeAlignmentId;
  const alignment = store.alignments.find((a) => a.id === alignmentId);
  const data = alignment?.superelevationData || createDefaultDataFromAlignment(alignment);

  const handlePointMove = (id: string, newStation: number, newSlope: number) => {
    if (!alignment || !alignment.superelevationData) return;
    const newPoints = alignment.superelevationData.superPoints.map((p) => {
      if (p.id === id) {
        return { ...p, station: newStation, slope: newSlope };
      }
      return p;
    });
    alignment.superelevationData = { ...alignment.superelevationData, superPoints: newPoints };
    store.recomputeGeometry();
  };

  const handlePointAdd = (pointData: Omit<SuperPoint, "id">) => {
    if (!alignment || !alignment.superelevationData) return;
    const newPoint = {
      id: "custom_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
      ...pointData,
    };
    const newPoints = [...alignment.superelevationData.superPoints, newPoint].sort(
      (a, b) => a.station - b.station
    );
    alignment.superelevationData = { ...alignment.superelevationData, superPoints: newPoints };
    store.recomputeGeometry();
  };

  const handleGeometryClick = (id: string) => {
    // optional logic
  };

  const handleHoverStation = (sta: number | null) => {
    if (sta !== null) {
      useStore.getState().setStation(sta);
    }
  };

  if (!alignment) {
    return <div className="flex-1 bg-white" />;
  }

  const startSta = alignment.points.length > 0 ? alignment.points[0].sta : 0;
  const endSta = alignment.points.length > 0 ? alignment.points[alignment.points.length - 1].sta : 100;

  return (
    <div className="w-full h-full relative">
       <SuperelevationChart
          data={data}
          onPointMove={handlePointMove}
          onPointAdd={handlePointAdd}
          zoomedGeometryId={null}
          onGeometryClick={handleGeometryClick}
          hoveredStation={store.station}
          onHoverStation={handleHoverStation}
          minimal={true}
          minStationOverride={startSta}
          maxStationOverride={endSta}
          syncTransform={true}
        />
    </div>
  );
}
