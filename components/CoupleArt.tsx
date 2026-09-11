export default function CoupleArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {/* Shared illustrated couple, drawn once, recolored per-usage via CSS custom
            properties (--fig-a-top, --fig-b-top, --skin-a, --skin-b, --hair-a, --hair-b,
            --sparkle) set on an ancestor element. Reused with <use href="#couple-art" />. */}
        <g id="couple-art">
          {/* Figure B (right, taller, curly hair, sunglasses pushed up, arm slung over A) */}
          <path d="M158 300 C158 230 172 190 208 188 C246 186 262 226 262 300 Z" fill="var(--fig-b-top)" />
          <path
            d="M196 210 C190 246 196 268 206 300 L188 300 C182 262 182 232 190 206 Z"
            fill="var(--fig-b-arm)"
            opacity={0.9}
          />
          <circle cx={211} cy={146} r={33} fill="var(--skin-b)" />
          <g fill="var(--hair-b)">
            <circle cx={182} cy={128} r={12} />
            <circle cx={188} cy={114} r={13} />
            <circle cx={202} cy={105} r={14} />
            <circle cx={219} cy={102} r={14} />
            <circle cx={236} cy={107} r={13} />
            <circle cx={246} cy={120} r={12} />
            <circle cx={240} cy={136} r={11} />
          </g>
          <g stroke="#231018" strokeWidth={2.6} strokeLinecap="round" fill="none">
            <path d="M197 150 q4 5 9 0" />
            <path d="M223 150 q4 5 9 0" />
          </g>
          <path d="M188 168 q23 20 46 0" stroke="#231018" strokeWidth={3} fill="none" strokeLinecap="round" />
          {/* sunglasses pushed up on forehead: two lenses + bridge, sitting in front of the hairline */}
          <g transform="rotate(-4 211 116)">
            <rect x={187} y={107} width={20} height={15} rx={6} fill="#231018" />
            <rect x={215} y={107} width={20} height={15} rx={6} fill="#231018" />
            <rect x={205} y={112} width={12} height={4} rx={2} fill="#231018" />
            <rect x={190} y={110} width={7} height={4} rx={2} fill="#ffffff" opacity={0.35} />
            <rect x={218} y={110} width={7} height={4} rx={2} fill="#ffffff" opacity={0.35} />
          </g>

          {/* Figure A (left, sunglasses on, hand near chin laughing) */}
          <path d="M62 300 C62 236 76 198 110 196 C146 194 160 232 160 300 Z" fill="var(--fig-a-top)" />
          <path
            d="M132 210 C144 224 150 236 148 250 C147 258 140 262 134 258 C128 254 128 246 126 236"
            fill="none"
            stroke="var(--skin-a)"
            strokeWidth={15}
            strokeLinecap="round"
          />
          <circle cx={110} cy={156} r={31} fill="var(--skin-a)" />
          <path
            d="M78 152 C74 118 90 95 112 95 C135 95 149 114 147 140 C147 146 142 147 141 141 C138 120 127 106 111 106 C99 106 89 114 85 130 L85 148 C85 154 79 158 78 152 Z"
            fill="var(--hair-a)"
          />
          <path
            d="M85 150 C82 168 84 184 90 196 C92 200 88 202 85 198 C77 186 74 168 78 150 Z"
            fill="var(--hair-a)"
          />
          {/* sunglasses: two rounded lenses + bridge, glossy highlight */}
          <g transform="rotate(-3 110 153)">
            <rect x={79} y={145} width={24} height={17} rx={8} fill="#231018" />
            <rect x={117} y={145} width={24} height={17} rx={8} fill="#231018" />
            <rect x={103} y={150} width={14} height={4} rx={2} fill="#231018" />
            <path d="M83 149 q8 -4 15 0" stroke="#ffffff" strokeWidth={2.4} fill="none" opacity={0.4} strokeLinecap="round" />
            <path d="M121 149 q8 -4 15 0" stroke="#ffffff" strokeWidth={2.4} fill="none" opacity={0.4} strokeLinecap="round" />
          </g>
          <path d="M95 171 q15 8 30 0" stroke="#231018" strokeWidth={3} fill="none" strokeLinecap="round" />

          {/* small sparkle accents */}
          <g fill="var(--sparkle)">
            <path d="M266 90 l3 8 8 3 -8 3 -3 8 -3-8-8-3 8-3 Z" />
            <path d="M52 118 l2.4 6.4 6.4 2.4 -6.4 2.4 -2.4 6.4 -2.4-6.4 -6.4-2.4 6.4-2.4 Z" />
          </g>
        </g>
      </defs>
    </svg>
  );
}
