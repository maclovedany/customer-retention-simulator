import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, SankeyChart, ScatterChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { UniversalTransition } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([BarChart, LineChart, SankeyChart, ScatterChart, GridComponent, LegendComponent, TooltipComponent, UniversalTransition, CanvasRenderer]);

// build(size)가 만든 옵션을 그린다. 차트는 한 번만 만들고 값이 바뀌면 setOption으로 갱신해 전환 애니메이션이 일어나게 한다.
// replace가 true면 옵션을 통째로 바꾼다 (계열 구성이 달라지는 흐름도용).
export default function EChart({ build, replace = false, label }) {
  const box = useRef(null), chart = useRef(null);
  const [size, setSize] = useState(null);

  useEffect(() => {
    chart.current = echarts.init(box.current);
    const measure = () => {
      const { clientWidth: width, clientHeight: height } = box.current;
      chart.current.resize();
      setSize(s => (s && s.width === width && s.height === height ? s : { width, height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    measure();
    return () => { observer.disconnect(); chart.current.dispose(); };
  }, []);

  useEffect(() => {
    if (size && size.width > 0 && size.height > 0) chart.current.setOption(build(size), replace);
  }, [build, size, replace]);

  return <div className="chart" ref={box} role="img" aria-label={label} />;
}
