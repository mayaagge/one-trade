// js/chart.js - a small inline-SVG line chart, written by hand.
//
// There is no charting library here, on purpose: the PRD asks for plain HTML,
// CSS and JavaScript. The geometry is separated from the drawing so the maths
// can be tested with `node --test`, where there is no document.
//
// ONE SERIES BY DEFAULT. The chart's title names it, so there is no legend box.
// A SECOND SERIES is optional, passed as `compare` - js/crash.js's Crash replay
// is the only caller that uses it, to draw a portfolio against the index it is
// measured against. Research's rolling-correlation chart passes no `compare`
// and is untouched by anything below that checks for one: every new branch is
// `if (compare)`, and the handful of formatting hooks (`formatDate`,
// `formatYTick`, `formatWhen`) default to exactly what this file always did, so
// an existing call with none of them produces the same output as before.
//
// Two series, not three: this chart draws identity with a legend, a line key in
// the tooltip and an end dot per line, which is what the two-series case needs.
// A chart with more series belongs to a different form (small multiples), not a
// third color bolted onto this one.

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
 * Pick a "nice" step for niceScale() - 1, 2 or 5 times a power of ten - so that
 * the domain gets roughly `targetTicks` gridlines.
 *
 * Research's correlation charts always span -1 to 1, so their yStep (0.1) is
 * just written down. Crash replay's dollar values range with the window and the
 * portfolio, so its y-axis needs this instead of a constant.
 */
export function niceStep(min, max, targetTicks = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error('niceStep() needs finite bounds');
  if (!(max > min)) throw new Error(`niceStep() got max ${max} at or below min ${min}`);
  if (!(targetTicks > 0)) throw new Error('niceStep() needs a positive tick count');

  const raw = (max - min) / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return round(step * magnitude);
}

/** The index of the last finite value, or -1 if there is none. */
function lastFiniteIndex(values) {
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return i;
  }
  return -1;
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
 * The shaded band behind the live part of a series.
 *
 * `fromIndex` is the index of the FIRST live point, and the band starts at the
 * point before it - the freeze date, the last frozen value - so every piece of
 * line drawn to a live value sits inside the shading, and no frozen value does.
 * It runs to the right edge of the plot, because the live part is the end of the
 * series by definition.
 *
 * Returns { x, y, width, height }. A width of 0 means there is nothing to shade.
 */
export function shadeRect(fromIndex, count, plot) {
  if (!Number.isInteger(fromIndex) || fromIndex < 0) {
    throw new Error(`shadeRect() got ${fromIndex} as a first live index`);
  }
  if (fromIndex >= count) return { x: plot.right, y: plot.top, width: 0, height: plot.height };
  const x = xOf(Math.max(0, fromIndex - 1), count, plot);
  return { x, y: plot.top, width: Math.max(0, plot.right - x), height: plot.height };
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

/**
 * Pick an SVG box for a plot of this width. Narrow screens get fewer x-axis
 * labels, because six dates will not fit without colliding.
 *
 * Shared by every chart in the game: it was Research's own helper, moved here
 * so Crash replay's chart is sized by the same rule rather than a second one
 * tuned separately. js/research.js re-exports it, unchanged, for its own
 * callers and tests.
 */
export function chartBox(containerWidth) {
  const width = Math.max(320, Math.min(880, Math.round(containerWidth) || 720));
  return {
    width,
    height: width < 520 ? 240 : 300,
    xTickCount: width < 420 ? 3 : width < 620 ? 4 : 6,
  };
}

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Draw the chart into `container` and wire the crosshair.
 *
 * spec: { dates, values, compare, seriesLabel, mark, live, width, height, yStep,
 *         valueLabel, formatValue, formatDate, formatYTick, formatWhen, padding }
 *
 * `padding` defaults to DEFAULT_PADDING and sets the room around the plot. Its
 * `left` has to fit the widest string formatYTick can produce - a caller whose
 * y-axis reads wider than one decimal place (Crash replay's "$10.5K" beside
 * Research's "0.8") passes a wider one, or the gutter clips the label.
 *
 * `mark` is { index, date, value, label } or null.
 * `live` is { fromIndex, label, band } or null: the part of the series that came
 * from live prices. `band` false draws the boundary and the label but no shading,
 * which is what a single live day gets - see js/liveRolling.js.
 *
 * `compare` is { values, label, formatValue } or null: a SECOND series, drawn in
 * the palette's slot-2 orange, with its own line key in the legend and the
 * tooltip. `seriesLabel` names the first series for the same two; without
 * `compare` neither is used and nothing changes - a single series needs no
 * legend, which is why this chart draws none until a second series asks for one.
 * `compare.formatValue` defaults to `formatValue`, for when both series are in
 * the same units (Crash replay's two lines both read in dollars).
 *
 * `formatDate`, `formatYTick` and `formatWhen` default to exactly what this file
 * always drew - a "YYYY-MM" x-tick, one decimal place on the y-axis, and the
 * rolling-correlation tooltip's own wording - so a caller that sets none of them
 * (every call before this one) is unaffected. Crash replay sets all three: its
 * x-axis needs a day, its y-axis needs dollars, and its tooltip needs no mention
 * of a 126-day window.
 */
export function renderLineChart(container, spec) {
  const {
    dates,
    values,
    compare = null,
    seriesLabel = null,
    mark = null,
    live = null,
    width = 720,
    height = 300,
    yStep = 0.1,
    valueLabel = 'value',
    formatValue = (v) => v.toFixed(4),
    describedBy = null,
    xTickCount = 6,
    formatDate = (d) => String(d).slice(0, 7),
    formatYTick = (v) => v.toFixed(1),
    formatWhen = (date, isLive) => `126 days ending ${date}${isLive ? ' · live, enters no verdict' : ''}`,
    padding = DEFAULT_PADDING,
  } = spec;
  const compareFormatValue = compare?.formatValue ?? formatValue;
  const primaryLabel = seriesLabel ?? valueLabel;

  const finite = values.filter((v) => Number.isFinite(v));
  const compareFinite = compare ? compare.values.filter((v) => Number.isFinite(v)) : [];
  const allFinite = [...finite, ...compareFinite];
  if (allFinite.length === 0) throw new Error('renderLineChart() got no finite values');
  const domain = niceScale(Math.min(...allFinite), Math.max(...allFinite), yStep);
  // The left gutter has to fit the widest y-tick label, which depends on
  // formatYTick: Research's correlation reads to one decimal ("0.8"), but Crash
  // replay's dollars can run to "$10.5K" - wider than DEFAULT_PADDING.left allows
  // for, which clipped the leading "$" off the canvas before this was a caller's
  // own choice. A caller with its own wide labels passes a wider `padding`.
  const plot = plotArea(width, height, padding);

  container.replaceChildren();

  const svg = el('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: '100%',
    height: 'auto',
    role: 'img',
    'aria-label': compare
      ? `${primaryLabel} and ${compare.label}, ${dates[0]} to ${dates[dates.length - 1]}`
      : `${valueLabel}, ${dates[0]} to ${dates[dates.length - 1]}`,
    class: 'chart-svg',
  });
  if (describedBy) svg.setAttribute('aria-describedby', describedBy);

  // The live part, drawn FIRST so the grid, the series and the crosshair all sit
  // on top of it. Its boundary is the freeze date: left of the rule the values
  // are the published, frozen ones; right of it they came from live prices.
  const liveFrom = live && Number.isInteger(live.fromIndex) && live.fromIndex < dates.length
    ? live.fromIndex
    : null;
  if (liveFrom !== null) {
    const box = shadeRect(liveFrom, dates.length, plot);
    if (live.band && box.width > 0) {
      svg.append(el('rect', {
        x: box.x, y: box.y, width: box.width, height: box.height, class: 'chart-shade',
      }));
    }
    svg.append(el('line', {
      x1: box.x, x2: box.x, y1: plot.top, y2: plot.bottom, class: 'chart-shade-rule',
    }));
    if (live.label) {
      // Anchored to the LEFT of the boundary: the band itself is only a few days
      // wide beside ten years, so a label inside it would run off the chart. It
      // sits a line below the marked-date label, which cannot then collide.
      const label = el('text', { x: box.x - 6, y: plot.top + 26, class: 'chart-shade-label' });
      label.textContent = live.label;
      svg.append(label);
    }
  }

  // Gridlines and y labels: solid hairlines, one shade off the surface.
  for (const t of domain.ticks) {
    const y = yOf(t, domain, plot);
    svg.append(el('line', { x1: plot.left, x2: plot.right, y1: y, y2: y, class: 'chart-grid' }));
    const label = el('text', { x: plot.left - 8, y: y + 4, class: 'chart-tick chart-tick-y' });
    label.textContent = formatYTick(t);
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
    label.textContent = formatDate(dates[i]);
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

  // The compare series, drawn BEFORE the primary line so the line the chart is
  // really about sits on top where the two cross.
  if (compare) {
    svg.append(el('path', { d: linePath(compare.values, domain, plot), class: 'chart-line-compare', fill: 'none' }));
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

  // Where each line ENDS, with a 2px surface ring, so two lines that have
  // crossed or converged are still told apart without hovering. A single series
  // needs no end mark - the axis already says where it stops.
  if (compare) {
    const lastPrimary = lastFiniteIndex(values);
    if (lastPrimary !== -1) {
      svg.append(el('circle', {
        cx: xOf(lastPrimary, dates.length, plot),
        cy: yOf(values[lastPrimary], domain, plot),
        r: 4,
        class: 'chart-end-dot',
      }));
    }
    const lastCompare = lastFiniteIndex(compare.values);
    if (lastCompare !== -1) {
      svg.append(el('circle', {
        cx: xOf(lastCompare, dates.length, plot),
        cy: yOf(compare.values[lastCompare], domain, plot),
        r: 4,
        class: 'chart-end-dot chart-end-dot-compare',
      }));
    }
  }

  // The hover layer: a crosshair that snaps to the nearest day, with one dot per
  // series so hovering shows where both lines sit that day.
  const crosshair = el('line', { y1: plot.top, y2: plot.bottom, class: 'chart-crosshair', x1: 0, x2: 0 });
  crosshair.style.display = 'none';
  const dot = el('circle', { r: 4, class: 'chart-hover-dot', cx: 0, cy: 0 });
  dot.style.display = 'none';
  svg.append(crosshair, dot);
  const compareDot = compare ? el('circle', { r: 4, class: 'chart-hover-dot chart-end-dot-compare', cx: 0, cy: 0 }) : null;
  if (compareDot) { compareDot.style.display = 'none'; svg.append(compareDot); }

  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.hidden = true;

  const readout = document.createElement('p');
  readout.className = 'chart-readout';
  readout.setAttribute('role', 'status');

  function show(index) {
    const v = values[index];
    const cv = compare ? compare.values[index] : null;
    const vFinite = Number.isFinite(v);
    const cvFinite = compare && Number.isFinite(cv);
    if (!vFinite && !cvFinite) return;
    const x = xOf(index, dates.length, plot);
    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.style.display = '';

    if (vFinite) {
      dot.setAttribute('cx', x);
      dot.setAttribute('cy', yOf(v, domain, plot));
      dot.style.display = '';
    } else {
      dot.style.display = 'none';
    }
    if (compareDot) {
      if (cvFinite) {
        compareDot.setAttribute('cx', x);
        compareDot.setAttribute('cy', yOf(cv, domain, plot));
        compareDot.style.display = '';
      } else {
        compareDot.style.display = 'none';
      }
    }

    // A live reading says so, so a hovered number is never mistaken for one of
    // the published, frozen values. Only Research's chart ever sets `live`.
    const isLive = liveFrom !== null && index >= liveFrom;
    const when = formatWhen(dates[index], isLive);

    tooltip.replaceChildren();
    if (compare) {
      // One tooltip, every series: a keyed row per line, value leading, so the
      // reader never has to land on a line to get its number. textContent only.
      if (vFinite) {
        const row = document.createElement('div');
        row.className = 'chart-tooltip-row';
        const key = document.createElement('span');
        key.className = 'chart-tooltip-key';
        const value = document.createElement('strong');
        value.textContent = formatValue(v);
        row.append(key, value);
        tooltip.append(row);
      }
      if (cvFinite) {
        const row = document.createElement('div');
        row.className = 'chart-tooltip-row';
        const key = document.createElement('span');
        key.className = 'chart-tooltip-key chart-tooltip-key-compare';
        const value = document.createElement('strong');
        value.textContent = compareFormatValue(cv);
        row.append(key, value);
        tooltip.append(row);
      }
      const whenLine = document.createElement('span');
      whenLine.className = 'chart-tooltip-when';
      whenLine.textContent = when;
      tooltip.append(whenLine);
      readout.textContent = [
        vFinite ? `${primaryLabel} ${formatValue(v)}` : null,
        cvFinite ? `${compare.label} ${compareFormatValue(cv)}` : null,
        when,
      ].filter(Boolean).join(', ');
    } else {
      // Value leads, label follows. textContent, never innerHTML. Unchanged from
      // before `compare` existed, so a caller with none of it sees none of this.
      const value = document.createElement('strong');
      value.textContent = formatValue(v);
      const label = document.createElement('span');
      label.textContent = when;
      tooltip.append(value, label);
      readout.textContent = `${formatValue(v)}, ${when}`;
    }
    tooltip.hidden = false;
    tooltip.style.left = `${(x / width) * 100}%`;
  }

  function hide() {
    crosshair.style.display = 'none';
    dot.style.display = 'none';
    if (compareDot) compareDot.style.display = 'none';
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

  // The legend: present whenever a second series is. A single series needs
  // none - the chart's title already names it.
  const legend = compare ? buildLegend(primaryLabel, compare.label) : null;
  container.append(...(legend ? [legend] : []), frame, readout);
  return { domain, plot };
}

/** The two-line-key legend a `compare` series adds above the chart. */
function buildLegend(primaryLabel, compareLabel) {
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  legend.append(
    legendItem(primaryLabel, 'chart-legend-swatch'),
    legendItem(compareLabel, 'chart-legend-swatch chart-legend-swatch-compare'),
  );
  return legend;
}

function legendItem(text, swatchClass) {
  const item = document.createElement('span');
  item.className = 'chart-legend-item';
  const swatch = document.createElement('span');
  swatch.className = swatchClass;
  const label = document.createElement('span');
  label.textContent = text;
  item.append(swatch, label);
  return item;
}
