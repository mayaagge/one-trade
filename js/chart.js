// js/chart.js - a small inline-SVG line chart, written by hand.
//
// There is no charting library here, on purpose: the PRD asks for plain HTML,
// CSS and JavaScript. The geometry is separated from the drawing so the maths
// can be tested with `node --test`, where there is no document.
//
// One series only. The chart's title names it, so there is no legend box.

const SVG_NS = 'http://www.w3.org/2000/svg';

// The drawing area inside the SVG. The bottom band is wide enough for the
// x-axis labels, so the axis is never clipped by the container's height.
export const DEFAULT_PADDING = { top: 16, right: 16, bottom: 28, left: 40 };

/**
 * Round a domain outwards to tidy tick values.
 * Returns { min, max, ticks } with ticks ascending and inclusive of both ends.
 */
export function niceScale(min, max, step = 0.1) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('niceScale() needs finite bounds');
  }
  if (!(step > 0)) throw new Error('niceScale() needs a positive step');
  if (max < min) throw new Error(`niceScale() got max ${max} below min ${min}`);

  // Work in integer multiples of the step to dodge floating-point drift,
  // so a domain of 0.2 to 0.9 gives exactly 0.2, 0.3, ... 0.9.
  const lo = Math.floor(round(min / step));
  const hi = Math.ceil(round(max / step));
  const ticks = [];
  for (let k = lo; k <= hi; k += 1) ticks.push(round(k * step));
  return { min: round(lo * step), max: round(hi * step), ticks };
}

// Kill the 1e-17 tails that come out of dividing by 0.1.
function round(x) {
  return Math.round(x * 1e10) / 1e10;
}

/**
 * The plot rectangle inside an SVG of this size.
 */
export function plotArea(width, height, padding = DEFAULT_PADDING) {
  const left = padding.left;
  const top = padding.top;
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  if (innerWidth <= 0 || innerHeight <= 0) {
    throw new Error(`plotArea() has no room: ${width}x${height} inside its padding`);
  }
  return { left, top, width: innerWidth, height: innerHeight, right: left + innerWidth, bottom: top + innerHeight };
}

/**
 * Index to x pixels. The first point sits on the left edge of the plot and the
 * last on the right edge, so the series spans the full width.
 */
export function xOf(index, count, plot) {
  if (count <= 1) return plot.left;
  return plot.left + (index / (count - 1)) * plot.width;
}

/**
 * Value to y pixels. SVG y grows downwards, so the domain maximum is at the top.
 */
export function yOf(value, domain, plot) {
  const span = domain.max - domain.min;
  if (span <= 0) return plot.top + plot.height / 2;
  const fraction = (value - domain.min) / span;
  return plot.bottom - fraction * plot.height;
}

/**
 * The series as an SVG path. Gaps (null/NaN) break the line into separate
 * subpaths rather than drawing a straight line across missing days.
 */
export function linePath(values, domain, plot) {
  let d = '';
  let penDown = false;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v === null || v === undefined || Number.isNaN(v)) {
      penDown = false;
      continue;
    }
    const x = xOf(i, values.length, plot);
    const y = yOf(v, domain, plot);
    d += `${penDown ? 'L' : 'M'}${fx(x)} ${fx(y)}`;
    penDown = true;
  }
  return d;
}

function fx(n) {
  return Math.round(n * 100) / 100;
}

/**
 * The data index nearest a pixel x. The crosshair snaps to this, so a reader
 * aims at a date rather than at a 2px line.
 */
export function nearestIndex(px, count, plot) {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  const fraction = (px - plot.left) / plot.width;
  const i = Math.round(fraction * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/**
 * Pick about `count` evenly spaced indices for x-axis labels, always including
 * the first and last.
 */
export function tickIndices(count, wanted = 6) {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const n = Math.min(wanted, count);
  if (n <= 1) return [0];
  const out = [];
  for (let k = 0; k < n; k += 1) {
    out.push(Math.round((k / (n - 1)) * (count - 1)));
  }
  return [...new Set(out)];
}

/**
 * One value per calendar year (its last point in the series), plus any extra
 * indices asked for - the marked date, the first and last day. This is what the
 * table view below the chart lists: 2,388 rows would be unreadable, and every
 * number the chart shows stays reachable without hovering.
 */
export function yearEndSample(dates, values, extraIndices = []) {
  const byYear = new Map();
  for (let i = 0; i < dates.length; i += 1) {
    byYear.set(String(dates[i]).slice(0, 4), i);
  }
  const keep = new Set([...byYear.values(), ...extraIndices.filter((i) => i >= 0 && i < dates.length)]);
  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => ({ index: i, date: dates[i], value: values[i] }));
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Draw the chart into `container` and wire the crosshair.
 *
 * spec: { dates, values, mark, width, height, yStep, valueLabel, formatValue }
 * `mark` is { index, date, value, label } or null.
 */
export function renderLineChart(container, spec) {
  const {
    dates,
    values,
    mark = null,
    width = 720,
    height = 300,
    yStep = 0.1,
    valueLabel = 'value',
    formatValue = (v) => v.toFixed(4),
    describedBy = null,
    xTickCount = 6,
  } = spec;

  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) throw new Error('renderLineChart() got no finite values');
  const domain = niceScale(Math.min(...finite), Math.max(...finite), yStep);
  const plot = plotArea(width, height, DEFAULT_PADDING);

  container.replaceChildren();

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: 'auto',
    role: 'img',
    'aria-label': `${valueLabel}, ${dates[0]} to ${dates[dates.length - 1]}`,
    class: 'chart-svg',
  });
  if (describedBy) svg.setAttribute('aria-describedby', describedBy);

  // Gridlines and y labels: solid hairlines, one shade off the surface.
  for (const t of domain.ticks) {
    const y = yOf(t, domain, plot);
    svg.append(el('line', { x1: plot.left, x2: plot.right, y1: y, y2: y, class: 'chart-grid' }));
    const label = el('text', { x: plot.left - 8, y: y + 4, class: 'chart-tick chart-tick-y' });
    label.textContent = t.toFixed(1);
    svg.append(label);
  }

  // The x axis itself.
  svg.append(el('line', {
    x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: 'chart-axis',
  }));

  const xTicks = tickIndices(dates.length, xTickCount);
  for (const i of xTicks) {
    const x = xOf(i, dates.length, plot);
    // The end labels are anchored inwards so they cannot overflow the viewBox.
    // This has to be a class, not a text-anchor attribute: the stylesheet's
    // .chart-tick-x rule would outrank a presentation attribute and the last
    // label would be clipped.
    const anchor = i === xTicks[0] ? ' chart-tick-x-start'
      : i === xTicks[xTicks.length - 1] ? ' chart-tick-x-end'
      : '';
    const label = el('text', { x, y: plot.bottom + 18, class: `chart-tick chart-tick-x${anchor}` });
    label.textContent = String(dates[i]).slice(0, 7);
    svg.append(label);
  }

  // The marked reference date: a hairline rule, drawn under the series.
  if (mark && Number.isFinite(mark.index)) {
    const x = xOf(mark.index, dates.length, plot);
    svg.append(el('line', { x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: 'chart-mark-rule' }));
    const label = el('text', { x: x + 6, y: plot.top + 12, class: 'chart-mark-label' });
    label.textContent = mark.label || String(mark.date);
    svg.append(label);
  }

  // The series: 2px, round join and cap.
  svg.append(el('path', { d: linePath(values, domain, plot), class: 'chart-line', fill: 'none' }));

  // The marked point, with a 2px surface ring so it reads over the line.
  if (mark && Number.isFinite(mark.index) && Number.isFinite(mark.value)) {
    svg.append(el('circle', {
      cx: xOf(mark.index, dates.length, plot),
      cy: yOf(mark.value, domain, plot),
      r: 5,
      class: 'chart-mark-dot',
    }));
  }

  // The hover layer: a crosshair that snaps to the nearest day.
  const crosshair = el('line', { y1: plot.top, y2: plot.bottom, class: 'chart-crosshair', x1: 0, x2: 0 });
  crosshair.style.display = 'none';
  const dot = el('circle', { r: 4, class: 'chart-hover-dot', cx: 0, cy: 0 });
  dot.style.display = 'none';
  svg.append(crosshair, dot);

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;

  const readout = document.createElement('p');
  readout.className = 'chart-readout';
  readout.setAttribute('role', 'status');

  function show(index) {
    const v = values[index];
    if (!Number.isFinite(v)) return;
    const x = xOf(index, dates.length, plot);
    const y = yOf(v, domain, plot);
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.style.display = '';
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.style.display = '';

    // Value leads, label follows. textContent, never innerHTML.
    tooltip.replaceChildren();
    const value = document.createElement('strong');
    value.textContent = formatValue(v);
    const when = document.createElement('span');
    when.textContent = `126 days ending ${dates[index]}`;
    tooltip.append(value, when);
    tooltip.hidden = false;
    tooltip.style.left = `${(x / width) * 100}%`;
    readout.textContent = `${formatValue(v)}, 126 days ending ${dates[index]}`;
  }

  function hide() {
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    tooltip.hidden = true;
  }

  svg.addEventListener('pointermove', (event) => {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    show(nearestIndex(px, dates.length, plot));
  });
  svg.addEventListener('pointerleave', hide);

  // Keyboard gets the same readings as the pointer.
  svg.setAttribute('tabindex', '0');
  let cursor = mark && Number.isFinite(mark.index) ? mark.index : dates.length - 1;
  svg.addEventListener('keydown', (event) => {
    const stride = event.shiftKey ? 21 : 1;
    if (event.key === 'ArrowRight') cursor = Math.min(dates.length - 1, cursor + stride);
    else if (event.key === 'ArrowLeft') cursor = Math.max(0, cursor - stride);
    else if (event.key === 'Home') cursor = 0;
    else if (event.key === 'End') cursor = dates.length - 1;
    else return;
    event.preventDefault();
    show(cursor);
  });
  svg.addEventListener('focus', () => show(cursor));
  svg.addEventListener('blur', hide);

  const frame = document.createElement('div');
  frame.className = 'chart-frame';
  frame.append(svg, tooltip);
  container.append(frame, readout);
  return { domain, plot };
}
