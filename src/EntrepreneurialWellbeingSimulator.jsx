import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ReferenceLine } from 'recharts';

// ============================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================
class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }
  
  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
  
  // Box-Muller transform for normal distribution
  nextNormal(mean = 0, std = 1) {
    const u1 = this.next();
    const u2 = this.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z * std;
  }
  
  // Random Normal with truncation: mean, std, min, max
  nextTruncatedNormal(mean, std, min, max) {
    let value = this.nextNormal(mean, std);
    return Math.max(min, Math.min(max, value));
  }
  
  // Poisson-like: returns 1 with probability = mean, else 0 (truncated to [min, max])
  nextPoisson(mean, min, max) {
    const value = this.next() < mean ? 1 : 0;
    return Math.max(min, Math.min(max, value));
  }
}

// ============================================
// SIMULATION ENGINE - EXACT PAPER EQUATIONS
// ============================================
const runSimulation = (params, finalTime = 500, seed = null) => {
  const { ambition, skill, selfRegulation, dynamism, coefficients = {} } = params;
  
  // Coefficients (default to 1 if not provided)
  const Var1 = coefficients.var1 ?? 1;
  const Var2 = coefficients.var2 ?? 1;
  const Var3 = coefficients.var3 ?? 1;
  const Var4 = coefficients.var4 ?? 1;
  const Var5 = coefficients.var5 ?? 1;
  const Var6 = coefficients.var6 ?? 1;
  const Var7 = coefficients.var7 ?? 1;
  const Var8 = coefficients.var8 ?? 1;
  const Var9 = coefficients.var9 ?? 1;
  const Var10 = coefficients.var10 ?? 1;
  
  // Initialize separate random streams with different seeds
  const baseSeed = seed || Math.floor(Math.random() * 1000000);
  const rng0_advance = new SeededRandom(baseSeed);
  const rng1_setback = new SeededRandom(baseSeed + 1000);
  const rng1_setbackPoisson = new SeededRandom(baseSeed + 1500);
  const rng2_challenge = new SeededRandom(baseSeed + 2000);
  const rng3_hindrance = new SeededRandom(baseSeed + 3000);
  
  // Stock variables (initial value = 0)
  let motivation = 0;
  let strain = 0;
  let cumulativeEffort = 0;
  let progress = 0;
  
  const trajectory = [];
  
  for (let time = 0; time <= finalTime; time++) {
    
    // ========== AUXILIARY VARIABLES ==========
    
    // Progress sensitivity = Time / Final_time
    const progressSensitivity = time / finalTime;
    
    // Relative progress = Progress / Cumulative_effort (or 0 if no effort)
    const relativeProgress = cumulativeEffort === 0 ? 0 : progress / cumulativeEffort;
    
    // Resources = Ambition × (1 - Progress_sensitivity) + Relative_progress × Progress_sensitivity
    const resources = ambition * (1 - progressSensitivity) + relativeProgress * progressSensitivity;
    
    // Challenge stressors: Random_Normal(mean=0, std=Ambition, min=0, max=Ambition)
    const challengeStressors = ambition === 0 ? 0 : 
      rng2_challenge.nextTruncatedNormal(0, ambition, 0, ambition);
    
    // Hindrance stressors: Random_Normal(mean=0, std=Ambition, min=0, max=Ambition)
    const hindranceStressors = ambition === 0 ? 0 : 
      rng3_hindrance.nextTruncatedNormal(0, ambition, 0, ambition);
    
    // Recovery = 1 - (1 - Self_regulation) × (Var2×Challenge + Var3×Hindrance) / (2×Ambition)
    const recovery = ambition === 0 ? 1 : 
      1 - (1 - selfRegulation) * (Var2 * challengeStressors + Var3 * hindranceStressors) / (2 * ambition);
    
    // ========== FLOW VARIABLES ==========
    
    // Motivation increase = max(Challenge_stressors, Resources) × Recovery × Var1
    const motivationIncrease = Math.max(challengeStressors, resources) * recovery * Var1;
    
    // Motivation decrease = min(Motivation_t, (1 - Self_regulation) × Hindrance_stressors × Var7)
    const motivationDecrease = Math.min(motivation, (1 - selfRegulation) * hindranceStressors * Var7);
    
    // Strain increase = (1 - Self_regulation) × (Var4×Challenge + Var5×Hindrance) / (2×Ambition)
    const strainIncrease = ambition === 0 ? 0 : 
      (1 - selfRegulation) * (Var4 * challengeStressors + Var5 * hindranceStressors) / (2 * ambition);
    
    // Strain decrease = min(Strain_t, Resources × Recovery × Var6)
    const strainDecrease = Math.min(strain, resources * recovery * Var6);
    
    // Effort = Var8 × (1 / (1 + e^(Strain - Motivation))) when Motivation > 0, else 0
    const effort = motivation === 0 ? 0 : 
      Var8 * (1 / (1 + Math.exp(strain - motivation)));
    
    // Advance = Effort × Skill × Random_Normal(mean=0, std=Ambition, min=0, max=Ambition)
    const advanceRandom = rng0_advance.nextTruncatedNormal(0, ambition, 0, ambition);
    const advance = skill === 0 ? 0 : effort * skill * advanceRandom;
    
    // Setback = Poisson(Dynamism) × min(Progress, Random_Normal(mean=0, std=Ambition, min=0, max=Ambition))
    const setbackPoisson = rng1_setbackPoisson.nextPoisson(dynamism, 0, 1);
    const setbackRandom = rng1_setback.nextTruncatedNormal(0, ambition, 0, ambition);
    const setback = setbackPoisson * Math.min(progress, setbackRandom);
    
    // ========== UPDATE STOCKS ==========
    
    motivation = motivation + motivationIncrease - motivationDecrease;
    strain = strain + strainIncrease - strainDecrease;
    cumulativeEffort = cumulativeEffort + effort;
    progress = progress + advance - setback;
    
    // Ensure non-negative (should be handled by MIN constraints, but safety check)
    motivation = Math.max(0, motivation);
    strain = Math.max(0, strain);
    progress = Math.max(0, progress);
    
    // ========== OUTPUT VARIABLES ==========
    
    // Well-being = Var9 × Motivation - Var10 × Strain
    const wellbeing = Var9 * motivation - Var10 * strain;
    
    // Record trajectory (sample every 5 periods for display performance)
    if (time % 5 === 0) {
      trajectory.push({
        period: time,
        motivation: +motivation.toFixed(3),
        strain: +strain.toFixed(3),
        effort: +effort.toFixed(3),
        performance: +progress.toFixed(3),
        wellbeing: +wellbeing.toFixed(3),
        resources: +resources.toFixed(3),
        recovery: +recovery.toFixed(3),
        cumulativeEffort: +cumulativeEffort.toFixed(3),
        challengeStressors: +challengeStressors.toFixed(3),
        hindranceStressors: +hindranceStressors.toFixed(3),
        advance: +advance.toFixed(3),
        setback: +setback.toFixed(3)
      });
    }
  }
  
  return trajectory;
};

// Run multiple simulations for distribution analysis
const runMultipleSimulations = (params, numRuns = 50, finalTime = 500) => {
  const results = [];
  for (let i = 0; i < numRuns; i++) {
    const trajectory = runSimulation(params, finalTime);
    const final = trajectory[trajectory.length - 1];
    results.push({
      run: i,
      performance: final.performance,
      wellbeing: final.wellbeing,
      finalEffort: final.effort
    });
  }
  return results;
};

// ============================================
// SYSTEM DIAGRAM COMPONENT
// ============================================
const SystemDiagram = ({ currentState, isActive }) => {
  const m = currentState?.motivation || 0;
  const s = currentState?.strain || 0;
  const e = currentState?.effort || 0;
  const p = currentState?.performance || 0;
  const r = currentState?.resources || 0;
  const rec = currentState?.recovery || 0;
  const wb = currentState?.wellbeing || 0;

  const getOpacity = (value, max = 1) => isActive ? Math.min(1, Math.max(0.2, Math.abs(value) / max)) : 0.15;

  return (
    <div style={{ background: 'rgba(15, 23, 42, 0.9)', borderRadius: '12px', padding: '1rem', border: '1px solid #334155' }}>
      <h3 style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '0.75rem', fontWeight: 500 }}>
        System State
      </h3>
      
      <svg viewBox="0 0 320 280" style={{ width: '100%', height: 'auto' }}>
        {/* STOCK: Motivation */}
        <rect x="15" y="60" width="70" height="35" rx="3" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="2" />
        <text x="50" y="75" textAnchor="middle" fill="#93c5fd" fontSize="9" fontWeight="500">Motivation</text>
        <text x="50" y="88" textAnchor="middle" fill="#3b82f6" fontSize="11" fontWeight="700">
          {isActive ? m.toFixed(1) : '—'}
        </text>

        {/* STOCK: Strain */}
        <rect x="15" y="140" width="70" height="35" rx="3" fill="#3f1f1f" stroke="#ef4444" strokeWidth="2" />
        <text x="50" y="155" textAnchor="middle" fill="#fca5a5" fontSize="9" fontWeight="500">Strain</text>
        <text x="50" y="168" textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="700">
          {isActive ? s.toFixed(1) : '—'}
        </text>

        {/* GAUGE: Well-being */}
        <rect x="100" y="100" width="60" height="35" rx="17" 
          fill={isActive && wb > 0 ? 'rgba(16, 185, 129, 0.2)' : isActive ? 'rgba(239, 68, 68, 0.2)' : '#1e293b'} 
          stroke={isActive && wb > 0 ? '#10b981' : isActive ? '#ef4444' : '#475569'} strokeWidth="2" />
        <text x="130" y="113" textAnchor="middle" fill="#94a3b8" fontSize="8">Well-being</text>
        <text x="130" y="127" textAnchor="middle" 
          fill={isActive && wb > 0 ? '#10b981' : isActive ? '#ef4444' : '#64748b'} fontSize="12" fontWeight="700">
          {isActive ? wb.toFixed(1) : '—'}
        </text>

        {/* FLOW: Effort */}
        <rect x="175" y="100" width="55" height="35" rx="3" fill="#1e293b" stroke="#f59e0b" strokeWidth="2" />
        <text x="202" y="113" textAnchor="middle" fill="#fcd34d" fontSize="9" fontWeight="500">Effort</text>
        <text x="202" y="127" textAnchor="middle" fill="#f59e0b" fontSize="11" fontWeight="700">
          {isActive ? e.toFixed(2) : '—'}
        </text>

        {/* STOCK: Performance (Progress) */}
        <rect x="245" y="60" width="65" height="35" rx="3" fill="#2e1f4d" stroke="#8b5cf6" strokeWidth="2" />
        <text x="277" y="75" textAnchor="middle" fill="#c4b5fd" fontSize="9" fontWeight="500">Performance</text>
        <text x="277" y="88" textAnchor="middle" fill="#8b5cf6" fontSize="11" fontWeight="700">
          {isActive ? p.toFixed(1) : '—'}
        </text>

        {/* AUX: Resources */}
        <ellipse cx="160" cy="40" rx="35" ry="15" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="160" y="37" textAnchor="middle" fill="#6ee7b7" fontSize="8">Resources</text>
        <text x="160" y="48" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="600">
          {isActive ? r.toFixed(2) : '—'}
        </text>

        {/* AUX: Recovery */}
        <ellipse cx="100" cy="210" rx="32" ry="14" fill="#1e293b" stroke="#10b981" strokeWidth="1.5" />
        <text x="100" y="207" textAnchor="middle" fill="#6ee7b7" fontSize="8">Recovery</text>
        <text x="100" y="218" textAnchor="middle" fill="#10b981" fontSize="9" fontWeight="600">
          {isActive ? rec.toFixed(2) : '—'}
        </text>

        {/* Stressors */}
        <text x="50" y="215" textAnchor="middle" fill="#64748b" fontSize="7">Stressors</text>
        <text x="50" y="227" textAnchor="middle" fill="#f59e0b" fontSize="8">
          C: {isActive ? currentState?.challengeStressors?.toFixed(2) : '—'}
        </text>
        <text x="50" y="239" textAnchor="middle" fill="#f59e0b" fontSize="8">
          H: {isActive ? currentState?.hindranceStressors?.toFixed(2) : '—'}
        </text>

        {/* Connections - simplified visual */}
        <path d="M 130 55 Q 90 55 85 60" fill="none" stroke="#10b981" strokeWidth="1.5" opacity={getOpacity(r)} />
        <line x1="85" y1="95" x2="100" y2="105" stroke="#3b82f6" strokeWidth="1.5" opacity={getOpacity(m, 50)} />
        <line x1="85" y1="140" x2="100" y2="130" stroke="#ef4444" strokeWidth="1.5" opacity={getOpacity(s, 50)} />
        <line x1="160" y1="117" x2="173" y2="117" stroke="#f59e0b" strokeWidth="1.5" opacity={getOpacity(e)} />
        <path d="M 230 112 Q 250 95 250 95" fill="none" stroke="#8b5cf6" strokeWidth="1.5" opacity={getOpacity(e)} />
        <path d="M 277 95 Q 277 30 195 38" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="3,2" opacity={getOpacity(p, 50)} />
        <path d="M 100 196 Q 70 180 60 175" fill="none" stroke="#10b981" strokeWidth="1" opacity={getOpacity(rec)} />

        {/* Legend */}
        <g transform="translate(200, 155)">
          <text x="0" y="0" fill="#475569" fontSize="7" fontWeight="500">LEGEND</text>
          <rect x="0" y="6" width="22" height="9" rx="2" fill="#1e3a5f" stroke="#3b82f6" strokeWidth="1" />
          <text x="26" y="13" fill="#64748b" fontSize="6">Stock</text>
          <ellipse cx="11" cy="26" rx="11" ry="5" fill="#1e293b" stroke="#10b981" strokeWidth="1" />
          <text x="26" y="28" fill="#64748b" fontSize="6">Auxiliary</text>
          <rect x="0" y="35" width="22" height="9" rx="4" fill="rgba(16, 185, 129, 0.2)" stroke="#10b981" strokeWidth="1" />
          <text x="26" y="42" fill="#64748b" fontSize="6">Gauge</text>
        </g>
      </svg>

      {isActive && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.6rem', color: '#64748b', lineHeight: 1.4 }}>
          <p>● Effort = 1/(1+e^(Strain-Motivation))</p>
          <p>● Performance feeds back to Resources</p>
        </div>
      )}
    </div>
  );
};

// ============================================
// PARAMETER SLIDER
// ============================================
const ParameterSlider = ({ label, value, onChange, description, color, min = 0, max = 1, step = 0.1 }) => (
  <div style={{ marginBottom: '1.1rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
      <label style={{ fontWeight: 500, color: '#e2e8f0', fontSize: '0.85rem' }}>{label}</label>
      <span style={{ background: color, padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, color: 'white' }}>
        {value.toFixed(1)}
      </span>
    </div>
    <input
      type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ width: '100%', accentColor: color, height: '5px' }}
    />
    <p style={{ fontSize: '0.65rem', color: '#94a3b8', marginTop: '0.25rem', lineHeight: 1.35 }}>{description}</p>
  </div>
);

// ============================================
// MAIN APPLICATION
// ============================================
export default function EntrepreneurialWellbeingSimulator() {
  // Parameters (defaults from paper)
  const [ambition, setAmbition] = useState(0.5);
  const [skill, setSkill] = useState(0.5);
  const [selfRegulation, setSelfRegulation] = useState(0.5);
  const [dynamism, setDynamism] = useState(0.2);
  
  // Coefficient weights (Var1-Var10, all default to 1)
  const [coefficients, setCoefficients] = useState({
    var1: 1,  // Motivation increase
    var2: 1,  // Challenge stressors → Recovery
    var3: 1,  // Hindrance stressors → Recovery
    var4: 1,  // Challenge stressors → Strain increase
    var5: 1,  // Hindrance stressors → Strain increase
    var6: 1,  // Strain decrease
    var7: 1,  // Motivation decrease
    var8: 1,  // Effort
    var9: 1,  // Motivation → Well-being
    var10: 1, // Strain → Well-being
  });
  
  const [trajectory, setTrajectory] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [multiRunResults, setMultiRunResults] = useState([]);
  const [viewMode, setViewMode] = useState('single');
  const [showEquations, setShowEquations] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [numSimulations, setNumSimulations] = useState(50);
  
  // Seed management
  const [currentSeed, setCurrentSeed] = useState(null);
  const [lockSeed, setLockSeed] = useState(false);
  
  const animationRef = useRef(null);
  const fullTrajectoryRef = useRef([]);

  const runAnimatedSimulation = useCallback(() => {
    const params = { ambition, skill, selfRegulation, dynamism, coefficients };
    const seed = lockSeed && currentSeed ? currentSeed : Math.floor(Math.random() * 1000000);
    if (!lockSeed) setCurrentSeed(seed);
    
    fullTrajectoryRef.current = runSimulation(params, 500, seed);
    setTrajectory([]);
    setCurrentIndex(0);
    setIsRunning(true);
    setViewMode('single');
  }, [ambition, skill, selfRegulation, dynamism, coefficients, lockSeed, currentSeed]);

  useEffect(() => {
    if (isRunning && currentIndex < fullTrajectoryRef.current.length) {
      animationRef.current = setTimeout(() => {
        setTrajectory(prev => [...prev, fullTrajectoryRef.current[currentIndex]]);
        setCurrentIndex(prev => prev + 1);
      }, 18);
    } else if (currentIndex >= fullTrajectoryRef.current.length) {
      setIsRunning(false);
    }
    return () => { if (animationRef.current) clearTimeout(animationRef.current); };
  }, [isRunning, currentIndex]);

  const runDistributionAnalysis = useCallback(() => {
    const params = { ambition, skill, selfRegulation, dynamism, coefficients };
    const results = runMultipleSimulations(params, numSimulations, 500);
    setMultiRunResults(results);
    setViewMode('distribution');
  }, [ambition, skill, selfRegulation, dynamism, coefficients, numSimulations]);

  const skipToEnd = () => {
    if (fullTrajectoryRef.current.length > 0) {
      setTrajectory(fullTrajectoryRef.current);
      setCurrentIndex(fullTrajectoryRef.current.length);
      setIsRunning(false);
    }
  };

  const reset = () => {
    setTrajectory([]);
    setCurrentIndex(0);
    setIsRunning(false);
    setMultiRunResults([]);
    setViewMode('single');
    if (!lockSeed) setCurrentSeed(null);
  };

  const resetCoefficients = () => {
    setCoefficients({
      var1: 1, var2: 1, var3: 1, var4: 1, var5: 1,
      var6: 1, var7: 1, var8: 1, var9: 1, var10: 1,
    });
  };

  const updateCoefficient = (key, value) => {
    setCoefficients(prev => ({ ...prev, [key]: value }));
  };

  const generateNewSeed = () => {
    setCurrentSeed(Math.floor(Math.random() * 1000000));
  };

  const currentState = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null;
  const finalState = trajectory.length > 0 ? trajectory[trajectory.length - 1] : null;

  // Outcome interpretation
  const getOutcomeInterpretation = () => {
    if (!finalState) return null;
    const p = finalState.performance;
    const wb = finalState.wellbeing;
    
    if (p < 2 && wb < -20) {
      return { type: 'burnout', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.1)',
        title: 'Burnout & Venture Abandonment',
        text: 'Strain overwhelmed motivation. The entrepreneur entered burnout territory and the venture stalled.' };
    }
    if (p < 5 && wb < -10) {
      return { type: 'struggling', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)',
        title: 'Struggling & At Risk',
        text: 'Well-being is deteriorating. Without improving self-regulation or adjusting ambition, burnout risk is high.' };
    }
    if (p < 5 && wb > 10) {
      return { type: 'resilient', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.1)',
        title: 'Resilient but Limited Progress',
        text: 'Strong self-regulation maintained well-being despite limited performance. May need to develop skill.' };
    }
    if (p > 20 && wb > 30) {
      return { type: 'thriving', color: '#10b981', bg: 'rgba(16, 185, 129, 0.1)',
        title: 'Thriving Entrepreneur',
        text: 'Excellent alignment of ambition, skill, and self-regulation. Both venture and well-being flourishing.' };
    }
    if (p > 15 && wb < 0) {
      return { type: 'strained', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.1)',
        title: 'Successful but Strained',
        text: 'Performance achieved at personal cost. Negative well-being suggests sustainability concerns.' };
    }
    return { type: 'moderate', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.1)',
      title: 'Steady Progress',
      text: 'The venture is developing with stable well-being. Explore parameter changes to improve outcomes.' };
  };

  const outcome = getOutcomeInterpretation();

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(145deg, #0c1222 0%, #1a2744 50%, #0f172a 100%)', color: '#e2e8f0', fontFamily: "'IBM Plex Sans', -apple-system, sans-serif", padding: '1rem' }}>
      
      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid #334155' }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 600, background: 'linear-gradient(90deg, #8b5cf6, #3b82f6, #10b981)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '0.3rem' }}>
          Dynamics of Entrepreneurial Well-being
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '0.75rem', maxWidth: '550px', margin: '0 auto 0.2rem' }}>
          Computational simulation exploring how ambition, skill, self-regulation, and dynamism shape outcomes
        </p>
        <p style={{ color: '#64748b', fontSize: '0.6rem', fontStyle: 'italic', maxWidth: '600px', margin: '0 auto' }}>
          Based on: Dimov, D. and Pistrui, J. 2024. Dynamics of entrepreneurial well-being: Insights from computational theory. <i>Journal of Business Research</i>, 172, 114427. <a href="https://doi.org/10.1016/j.jbusres.2023.114427" target="_blank" rel="noopener noreferrer" style={{ color: '#8b5cf6' }}>https://doi.org/10.1016/j.jbusres.2023.114427</a>
        </p>
      </header>

      <div className="main-grid">
        
        {/* Left Panel: Parameters */}
        <aside style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.9rem', border: '1px solid #334155' }}>
          <h2 style={{ fontSize: '0.85rem', marginBottom: '0.9rem', color: '#f1f5f9', fontWeight: 600 }}>
            Parameters
          </h2>
          
          <ParameterSlider label="Ambition" value={ambition} onChange={setAmbition} color="#8b5cf6"
            description="Activates system. Affects resources, stressors, advance & setback magnitude." />
          <ParameterSlider label="Skill" value={skill} onChange={setSkill} color="#3b82f6"
            description="Multiplies effort into venture advancement." />
          <ParameterSlider label="Self-Regulation" value={selfRegulation} onChange={setSelfRegulation} color="#10b981"
            description="Protects recovery, dampens strain increase & motivation decrease." />
          <ParameterSlider label="Dynamism" value={dynamism} onChange={setDynamism} color="#f59e0b"
            description="Market turbulence. Controls setback frequency (Poisson rate)." />

          {/* Seed control */}
          <div style={{ marginTop: '0.6rem', padding: '0.5rem', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '6px', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.65rem', color: '#94a3b8' }}>Random Seed</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={lockSeed} onChange={(e) => setLockSeed(e.target.checked)}
                  style={{ accentColor: '#8b5cf6', width: '11px', height: '11px' }} />
                <span style={{ fontSize: '0.6rem', color: '#94a3b8' }}>Lock</span>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '0.65rem', color: '#8b5cf6', background: '#1e293b', padding: '0.2rem 0.35rem', borderRadius: '3px' }}>
                {currentSeed || '—'}
              </code>
              <button onClick={generateNewSeed} 
                style={{ fontSize: '0.6rem', padding: '0.2rem 0.35rem', background: '#374151', border: 'none', borderRadius: '3px', color: '#94a3b8', cursor: 'pointer' }}>
                New
              </button>
            </div>
            <p style={{ fontSize: '0.55rem', color: '#64748b', marginTop: '0.25rem' }}>
              Lock to replay identical market conditions
            </p>
          </div>

          {/* Control buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.6rem' }}>
            <div style={{ fontSize: '0.6rem', color: '#64748b', marginBottom: '0.1rem' }}>Single trajectory (animated)</div>
            <button onClick={runAnimatedSimulation} disabled={isRunning}
              style={{ background: ambition === 0 ? '#374151' : 'linear-gradient(135deg, #8b5cf6, #6366f1)', color: 'white', border: 'none', padding: '0.55rem', borderRadius: '6px', fontWeight: 600, cursor: isRunning || ambition === 0 ? 'not-allowed' : 'pointer', opacity: isRunning ? 0.7 : 1, fontSize: '0.8rem' }}>
              {ambition === 0 ? 'Set Ambition > 0' : isRunning ? `Period ${currentIndex * 5}/500` : '▶ Run Once'}
            </button>
            {isRunning && (
              <button onClick={skipToEnd} style={{ background: '#374151', color: '#e2e8f0', border: '1px solid #4b5563', padding: '0.35rem', borderRadius: '5px', cursor: 'pointer', fontSize: '0.75rem' }}>
                Skip to End
              </button>
            )}
            
            <div style={{ fontSize: '0.6rem', color: '#64748b', marginTop: '0.3rem', marginBottom: '0.1rem' }}>Distribution analysis</div>
            <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
              <button onClick={runDistributionAnalysis} disabled={isRunning || ambition === 0}
                style={{ flex: 1, background: '#374151', color: '#e2e8f0', border: '1px solid #4b5563', padding: '0.35rem', borderRadius: '5px', cursor: isRunning || ambition === 0 ? 'not-allowed' : 'pointer', fontSize: '0.75rem', opacity: isRunning || ambition === 0 ? 0.5 : 1 }}>
                ◆ Run {numSimulations}×
              </button>
              <select 
                value={numSimulations} 
                onChange={(e) => setNumSimulations(parseInt(e.target.value))}
                style={{ background: '#374151', color: '#e2e8f0', border: '1px solid #4b5563', padding: '0.3rem', borderRadius: '5px', fontSize: '0.7rem', cursor: 'pointer' }}>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
            </div>
            <p style={{ fontSize: '0.5rem', color: '#64748b', margin: '0', lineHeight: 1.3 }}>
              Same parameters, different random draws — see the range of possible outcomes
            </p>
            
            <button onClick={reset} style={{ background: 'transparent', color: '#64748b', border: 'none', padding: '0.2rem', cursor: 'pointer', fontSize: '0.7rem', marginTop: '0.2rem' }}>
              Reset
            </button>
          </div>

          {/* Advanced Settings - Coefficient Weights */}
          <div style={{ marginTop: '0.6rem', border: '1px solid #334155', borderRadius: '6px', overflow: 'hidden' }}>
            <button onClick={() => setShowAdvanced(!showAdvanced)}
              style={{ width: '100%', padding: '0.45rem 0.5rem', background: 'rgba(15, 23, 42, 0.5)', border: 'none', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{showAdvanced ? '▼' : '▶'} Advanced: Weights</span>
              {Object.values(coefficients).some(v => v !== 1) && (
                <span style={{ background: '#f59e0b', color: '#000', fontSize: '0.5rem', padding: '1px 4px', borderRadius: '3px', fontWeight: 600 }}>Modified</span>
              )}
            </button>
            {showAdvanced && (
              <div style={{ padding: '0.5rem', background: 'rgba(15, 23, 42, 0.3)' }}>
                <p style={{ fontSize: '0.55rem', color: '#64748b', marginBottom: '0.4rem', lineHeight: 1.3 }}>
                  Adjust relationship strengths (0-1). Default = 1.
                </p>
                
                {/* Motivation flows */}
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.55rem', color: '#3b82f6', fontWeight: 600, marginBottom: '0.2rem' }}>Motivation</div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V1 (M↑)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var1}
                      onChange={(e) => updateCoefficient('var1', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '0.5rem', color: '#3b82f6', width: '22px', textAlign: 'right' }}>{coefficients.var1.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V7 (M↓)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var7}
                      onChange={(e) => updateCoefficient('var7', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#3b82f6' }} />
                    <span style={{ fontSize: '0.5rem', color: '#3b82f6', width: '22px', textAlign: 'right' }}>{coefficients.var7.toFixed(1)}</span>
                  </div>
                </div>

                {/* Strain flows */}
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.55rem', color: '#ef4444', fontWeight: 600, marginBottom: '0.2rem' }}>Strain</div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V4 (C→S↑)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var4}
                      onChange={(e) => updateCoefficient('var4', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#ef4444' }} />
                    <span style={{ fontSize: '0.5rem', color: '#ef4444', width: '22px', textAlign: 'right' }}>{coefficients.var4.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V5 (H→S↑)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var5}
                      onChange={(e) => updateCoefficient('var5', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#ef4444' }} />
                    <span style={{ fontSize: '0.5rem', color: '#ef4444', width: '22px', textAlign: 'right' }}>{coefficients.var5.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V6 (S↓)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var6}
                      onChange={(e) => updateCoefficient('var6', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#ef4444' }} />
                    <span style={{ fontSize: '0.5rem', color: '#ef4444', width: '22px', textAlign: 'right' }}>{coefficients.var6.toFixed(1)}</span>
                  </div>
                </div>

                {/* Recovery */}
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.55rem', color: '#10b981', fontWeight: 600, marginBottom: '0.2rem' }}>Recovery</div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V2 (C→Rec)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var2}
                      onChange={(e) => updateCoefficient('var2', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#10b981' }} />
                    <span style={{ fontSize: '0.5rem', color: '#10b981', width: '22px', textAlign: 'right' }}>{coefficients.var2.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V3 (H→Rec)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var3}
                      onChange={(e) => updateCoefficient('var3', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#10b981' }} />
                    <span style={{ fontSize: '0.5rem', color: '#10b981', width: '22px', textAlign: 'right' }}>{coefficients.var3.toFixed(1)}</span>
                  </div>
                </div>

                {/* Effort & Well-being */}
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.55rem', color: '#f59e0b', fontWeight: 600, marginBottom: '0.2rem' }}>Effort</div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V8 (Effort)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var8}
                      onChange={(e) => updateCoefficient('var8', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#f59e0b' }} />
                    <span style={{ fontSize: '0.5rem', color: '#f59e0b', width: '22px', textAlign: 'right' }}>{coefficients.var8.toFixed(1)}</span>
                  </div>
                </div>

                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ fontSize: '0.55rem', color: '#8b5cf6', fontWeight: 600, marginBottom: '0.2rem' }}>Well-being</div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.2rem' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V9 (M→WB)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var9}
                      onChange={(e) => updateCoefficient('var9', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#8b5cf6' }} />
                    <span style={{ fontSize: '0.5rem', color: '#8b5cf6', width: '22px', textAlign: 'right' }}>{coefficients.var9.toFixed(1)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.5rem', color: '#94a3b8', width: '55px' }}>V10 (S→WB)</span>
                    <input type="range" min="0" max="1" step="0.1" value={coefficients.var10}
                      onChange={(e) => updateCoefficient('var10', parseFloat(e.target.value))}
                      style={{ flex: 1, height: '4px', accentColor: '#8b5cf6' }} />
                    <span style={{ fontSize: '0.5rem', color: '#8b5cf6', width: '22px', textAlign: 'right' }}>{coefficients.var10.toFixed(1)}</span>
                  </div>
                </div>

                <button onClick={resetCoefficients}
                  style={{ width: '100%', padding: '0.3rem', background: '#374151', border: 'none', borderRadius: '4px', color: '#94a3b8', fontSize: '0.6rem', cursor: 'pointer', marginTop: '0.2rem' }}>
                  Reset All to 1.0
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* Center: Visualizations */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {viewMode === 'single' ? (
            <>
              {/* Performance & Well-being Chart */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.85rem', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                  Performance & Well-being
                </h3>
                <ResponsiveContainer width="100%" height={165}>
                  <LineChart data={trajectory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #374151', borderRadius: '5px', fontSize: '0.65rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                    <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                    <Line type="monotone" dataKey="performance" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Performance" />
                    <Line type="monotone" dataKey="wellbeing" stroke="#10b981" strokeWidth={2} dot={false} name="Well-being" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Motivation & Strain Chart */}
              <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.85rem', border: '1px solid #334155' }}>
                <h3 style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                  Motivation, Strain & Effort
                </h3>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={trajectory}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 9 }} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 9 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #374151', borderRadius: '5px', fontSize: '0.65rem' }} />
                    <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                    <Line type="monotone" dataKey="motivation" stroke="#3b82f6" strokeWidth={2} dot={false} name="Motivation" />
                    <Line type="monotone" dataKey="strain" stroke="#ef4444" strokeWidth={2} dot={false} name="Strain" />
                    <Line type="monotone" dataKey="effort" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 2" dot={false} name="Effort" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Metrics */}
              {finalState && (
                <div className="metrics-grid">
                  {[
                    { label: 'Performance', value: finalState.performance.toFixed(1), color: finalState.performance > 10 ? '#8b5cf6' : '#64748b' },
                    { label: 'Well-being', value: finalState.wellbeing.toFixed(1), color: finalState.wellbeing > 0 ? '#10b981' : '#ef4444' },
                    { label: 'Effort', value: finalState.effort.toFixed(2), color: finalState.effort > 0.5 ? '#f59e0b' : '#64748b' },
                    { label: 'Resources', value: finalState.resources.toFixed(2), color: '#3b82f6' }
                  ].map((m, i) => (
                    <div key={i} style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '5px', padding: '0.45rem', borderLeft: `3px solid ${m.color}`, border: '1px solid #334155' }}>
                      <span style={{ fontSize: '0.5rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>
                      <span style={{ display: 'block', fontSize: '0.95rem', fontWeight: 700, color: m.color }}>{m.value}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Outcome */}
              {outcome && (
                <div style={{ background: outcome.bg, borderRadius: '6px', padding: '0.65rem', borderLeft: `3px solid ${outcome.color}`, border: '1px solid #334155' }}>
                  <h4 style={{ fontSize: '0.7rem', color: outcome.color, marginBottom: '0.2rem', fontWeight: 600 }}>{outcome.title}</h4>
                  <p style={{ fontSize: '0.7rem', color: '#cbd5e1', lineHeight: 1.4 }}>{outcome.text}</p>
                </div>
              )}
            </>
          ) : (
            /* Distribution View */
            <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.85rem', border: '1px solid #334155', flex: 1 }}>
              <h3 style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.4rem', fontWeight: 500 }}>
                Distribution ({multiRunResults.length} Simulations)
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <ScatterChart margin={{ bottom: 20, left: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis type="number" dataKey="performance" stroke="#64748b" tick={{ fontSize: 9 }}
                    label={{ value: 'Performance', position: 'insideBottom', offset: -10, fill: '#64748b', fontSize: 9 }} />
                  <YAxis type="number" dataKey="wellbeing" stroke="#64748b" tick={{ fontSize: 9 }}
                    label={{ value: 'Well-being', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 9 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #374151', borderRadius: '5px', fontSize: '0.65rem' }}
                    formatter={(value) => value.toFixed(1)} />
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Scatter data={multiRunResults} fill="#8b5cf6" fillOpacity={0.7} />
                </ScatterChart>
              </ResponsiveContainer>
              
              <div className="stats-grid">
                {multiRunResults.length > 0 && [
                  { label: 'Avg Performance', value: (multiRunResults.reduce((a, b) => a + b.performance, 0) / multiRunResults.length).toFixed(1) },
                  { label: 'Avg Well-being', value: (multiRunResults.reduce((a, b) => a + b.wellbeing, 0) / multiRunResults.length).toFixed(1) },
                  { label: 'Success (P>10)', value: `${((multiRunResults.filter(r => r.performance > 10).length / multiRunResults.length) * 100).toFixed(0)}%` },
                  { label: 'Burnout (WB<-20)', value: `${((multiRunResults.filter(r => r.wellbeing < -20).length / multiRunResults.length) * 100).toFixed(0)}%` }
                ].map((s, i) => (
                  <div key={i} style={{ textAlign: 'center' }}>
                    <span style={{ display: 'block', fontSize: '0.5rem', color: '#94a3b8' }}>{s.label}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#8b5cf6' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* Right Panel */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <SystemDiagram currentState={currentState} isActive={trajectory.length > 0} />
          
          {/* Equations */}
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', border: '1px solid #334155', overflow: 'hidden' }}>
            <button onClick={() => setShowEquations(!showEquations)}
              style={{ width: '100%', padding: '0.5rem 0.65rem', background: 'none', border: 'none', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left' }}>
              {showEquations ? '▼' : '▶'} Model Equations
            </button>
            {showEquations && (
              <div style={{ padding: '0 0.65rem 0.65rem', fontSize: '0.55rem', fontFamily: 'monospace', lineHeight: 1.5 }}>
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ color: '#8b5cf6', fontWeight: 600 }}>Stocks (Σ over time)</div>
                  <code style={{ color: '#94a3b8' }}>M, S, P, CumulEffort</code>
                </div>
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ color: '#8b5cf6', fontWeight: 600 }}>Effort</div>
                  <code style={{ color: '#94a3b8' }}>1/(1+e^(S-M))</code>
                </div>
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ color: '#8b5cf6', fontWeight: 600 }}>Flows</div>
                  <code style={{ display: 'block', color: '#94a3b8' }}>M↑ = max(C,Res)×Rec</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>M↓ = min(M,(1-SR)×H)</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>S↑ = (1-SR)(C+H)/(2A)</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>S↓ = min(S,Res×Rec)</code>
                </div>
                <div style={{ marginBottom: '0.4rem' }}>
                  <div style={{ color: '#8b5cf6', fontWeight: 600 }}>Performance</div>
                  <code style={{ display: 'block', color: '#94a3b8' }}>Adv = E×Sk×N(0,A,0,A)</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>Set = Pois(D)×min(P,N)</code>
                </div>
                <div>
                  <div style={{ color: '#8b5cf6', fontWeight: 600 }}>Auxiliary</div>
                  <code style={{ display: 'block', color: '#94a3b8' }}>Res = A(1-t/T)+RP×t/T</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>Rec = 1-(1-SR)(C+H)/(2A)</code>
                  <code style={{ display: 'block', color: '#94a3b8' }}>WB = M - S</code>
                </div>
              </div>
            )}
          </div>

          {/* Insights */}
          <div style={{ background: 'rgba(30, 41, 59, 0.7)', borderRadius: '10px', padding: '0.65rem', border: '1px solid #334155' }}>
            <h3 style={{ fontSize: '0.7rem', color: '#94a3b8', marginBottom: '0.35rem', fontWeight: 500 }}>Key Insights</h3>
            <ul style={{ fontSize: '0.6rem', color: '#cbd5e1', lineHeight: 1.45, paddingLeft: '0.85rem', margin: 0 }}>
              <li style={{ marginBottom: '0.25rem' }}>Ambition activates system but also increases stressors</li>
              <li style={{ marginBottom: '0.25rem' }}>Self-regulation has minimum threshold to avoid burnout</li>
              <li style={{ marginBottom: '0.25rem' }}>Skill amplifies effort → performance</li>
              <li>Performance feeds back to resources over time</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
