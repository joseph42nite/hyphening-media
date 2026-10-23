import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Share2, Check, Sparkles, Layers, Cpu, TrendingUp, Compass, Award, ExternalLink, ShieldCheck } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import SEOHead from '../components/SEOHead';
import logoImg from '../assets/logo.png';

export const PILLARS_LIST = [
  {
    slug: 'content-strategy',
    number: '01',
    kanji: '戦略',
    kanjiRomaji: 'SENRYAKU',
    title: 'Content Strategy',
    tagline: 'Viral Hooks, Algorithmic Cadence & Retention Engineering',
    summary: 'We build monthly editorial calendars, high-retention script formulas, and platform-native distribution loops engineered to capture immediate attention and compound organic brand reach.',
    image: '/capabilities/content-strategy.webp',
    accentColor: '#e0231c',
    heroStat: '65%+',
    heroStatLabel: 'Average Watch Duration Target',
    deliverables: [
      {
        title: '30-Day Omnichannel Roadmap',
        desc: 'Rigorous editorial calendar mapped to audience search intent, platform trends, and business conversion milestones.'
      },
      {
        title: '3-Second Hook Engineering',
        desc: 'Surgical first-frame and auditory pattern interrupts tested to stop thumb-scroll within the critical 3-second window.'
      },
      {
        title: 'Platform-Native Scripting',
        desc: 'Bespoke scripts structured for TikTok, Instagram Reels, YouTube Shorts, and YouTube Long-Form retention curves.'
      },
      {
        title: 'Algorithmic Cadence & Timing',
        desc: 'Custom posting schedules synchronized with audience activity clusters across international timezones.'
      },
      {
        title: 'Competitor & Trend Forensics',
        desc: 'Continuous real-time competitive analysis identifying viral outliers and untapped topic white-spaces in your industry.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Audience Forensics & Niche Arbitrage',
        desc: 'We mine high-engagement comments, search query patterns, and competitor gaps to uncover the exact questions your ideal clients are asking.'
      },
      {
        step: '02',
        title: 'Script Architecture & Pacing',
        desc: 'Every script is engineered with a curiosity gap hook, rapid value delivery, pattern interrupts, and seamless call-to-action transitions.'
      },
      {
        step: '03',
        title: 'Systematic Production Blueprint',
        desc: 'We package shoots into high-efficiency batch days, delivering 30 to 60 multi-format assets per filming session.'
      },
      {
        step: '04',
        title: 'Data-Feedback Iteration Loop',
        desc: 'Post-distribution retention graphs are analyzed weekly to double down on breakthrough angles and kill underperforming formats.'
      }
    ],
    techStack: ['Notion Enterprise', 'TubeBuddy', 'TikTok Creative Center', 'VidIQ', 'Meta Insights', 'Custom Python Trend Scrapers'],
    metrics: [
      { value: '> 65%', label: 'Watch Completion Rate' },
      { value: '3.2X', label: 'Average Organic Reach Surge' },
      { value: '< 24hr', label: 'Trend-to-Production Velocity' }
    ],
    editorial: `
### Why Most Content Strategies Fail

Traditional content marketing treats social media like a billboard: static announcements, corporate jargon, and generic stock visuals. Algorithms ignore them, and users scroll past in milliseconds.

At Hyphening Media, we treat content strategy as high-stakes cognitive engineering. We understand the mathematics of social feeds: initial click-through rate, 3-second drop-off resistance, and mid-roll pattern interrupts.

### The Retention Funnel

Every piece of media we architect operates on a strict four-phase cognitive sequence:
1. **The Pattern Interrupt (0–3s):** A visual or conceptual anomaly that forces cognitive re-evaluation and halts scrolling.
2. **The Curiosity Gap (3–10s):** Introducing tension or an intriguing premise that promises payoff only upon continued viewing.
3. **The Value Delivery (10–50s):** High-density, jargon-free insight or entertainment delivered with rapid visual pacing.
4. **The Frictionless Action (50–60s):** A contextual, natural transition guiding viewers into comments, shares, or bio links without aggressive sales friction.

By standardizing this architecture across every asset, our partners transform erratic social posting into a reliable client-acquisition engine.
`
  },
  {
    slug: 'video-production',
    number: '02',
    kanji: '映像',
    kanjiRomaji: 'EIZO',
    title: 'Video Production',
    tagline: 'Cinema Grade 4K & High-Retention Post-Production',
    summary: 'End-to-end cinematic short-form and long-form video execution — from pre-production storyboarding and on-site direction to color grading, sound design, and kinetic motion graphics.',
    image: '/capabilities/video-production.png',
    accentColor: '#e0231c',
    heroStat: '4K DCI',
    heroStatLabel: 'Cinema Grade 10-bit Color Capture',
    deliverables: [
      {
        title: 'On-Location & Studio 4K Filming',
        desc: 'Full cinema camera packages (Sony FX cinema line, prime glass, wireless dual-channel audio, and tailored three-point lighting).'
      },
      {
        title: 'High-Pace Short-Form Editing',
        desc: 'Frame-accurate cuts, speed-ramps, dynamic camera punches, and kinetic typography optimized for mobile devices.'
      },
      {
        title: 'Kinetic Motion Graphics & VFX',
        desc: 'Custom visual overlays, UI mockups, 3D element compositing, and animated graphics that reinforce core concepts.'
      },
      {
        title: 'Spatial Sound Design & Foley',
        desc: 'Multi-layer atmospheric audio, custom sound effects, subtle risers, and mastered voice tracks for pristine clarity.'
      },
      {
        title: 'Color Grading & Multi-Aspect Exports',
        desc: 'DaVinci Resolve color passes for rich cinematic tone, exported simultaneously in 9:16 vertical, 16:9 widescreen, and 1:1 square.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Pre-Production & Scene Blueprinting',
        desc: 'Comprehensive shot lists, mood boards, lighting design schematics, and talent direction briefs are locked before rolling.'
      },
      {
        step: '02',
        title: 'Principal Photography',
        desc: 'On-set direction focused on authentic executive delivery, multi-angle coverage, and b-roll captures that tell a visceral story.'
      },
      {
        step: '03',
        title: 'Assembly & Pattern Interrupts',
        desc: 'Rough cut assembly followed by granular pace trimming, sound effect mapping, and kinetic text animation.'
      },
      {
        step: '04',
        title: 'Mastering & Multi-Format Delivery',
        desc: 'Broadcast-compliant loudness normalization, custom LUT application, and platform-optimized compression passes.'
      }
    ],
    techStack: ['DaVinci Resolve Studio', 'Adobe Premiere Pro', 'After Effects', 'Sony FX Cinema Line', 'Sennheiser & Rode Pro Audio'],
    metrics: [
      { value: '4K 10-bit', label: 'Color Depth Standards' },
      { value: '> 85%', label: 'Sound-On Audience Engagement' },
      { value: '48hr', label: 'Fast-Track First Cut Turnaround' }
    ],
    editorial: `
### Cinematic Polish Meets Social Pacing

High production value alone does not guarantee performance. A Hollywood-budget commercial will flop on TikTok if it lacks algorithmic pacing. Conversely, low-effort smartphone clips often lack the authority required to command enterprise contracts.

Hyphening Media bridges this chasm. We fuse high-end cinema optics — shallow depth of field, anamorphic flaring, calibrated 10-bit color grading — with aggressive digital-first pacing.

### The Physics of Modern Attention

We eliminate every redundant breath, dead frame, and lingering transition. Every 1.8 to 2.4 seconds, the viewer's brain receives a fresh stimulus:
- A camera angle punch-in
- A motion-tracked typography highlight
- A visceral spatial sound cue
- A context-reinforcing B-roll cutaway

This relentless visual momentum creates a hypnotic viewing experience that locks the audience until the final second.
`
  },
  {
    slug: 'social-media-ops',
    number: '03',
    kanji: '運用',
    kanjiRomaji: 'UNYO',
    title: 'Social Media Ops',
    tagline: 'Daily Engagement, Community Management & Algorithmic Dominance',
    summary: 'End-to-end multi-platform operations across Instagram, YouTube, TikTok, and LinkedIn with proactive community nurturing, daily posting, and real-time algorithmic adaptation.',
    image: '/capabilities/social-media-ops.webp',
    accentColor: '#e0231c',
    heroStat: '24/7',
    heroStatLabel: 'Community Response & Channel Governance',
    deliverables: [
      {
        title: 'Omnichannel Daily Publishing',
        desc: 'Flawless publishing across all accounts with native formatting, optimized tagging, thumbnail curation, and geo-targeting.'
      },
      {
        title: 'Proactive Community Nurturing',
        desc: 'Engaging high-value comments within 15 minutes of posting to trigger early platform velocity and community warmth.'
      },
      {
        title: 'Inbound Direct Message Funneling',
        desc: 'Systematic DM triage separating casual fans from qualified enterprise leads and routing them directly to your sales pipeline.'
      },
      {
        title: 'Trending Audio & Feature Adaptation',
        desc: 'Daily monitoring of emerging audio trends, algorithmic changes, and feature launches (e.g. carousels, broadcasts) for rapid deployment.'
      },
      {
        title: 'Weekly Executive Briefings',
        desc: 'Detailed growth velocity audits tracking follower acquisition cost, engagement rates, and top-converting content themes.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Brand Tone & Archetype Codification',
        desc: 'We construct an unshakeable operational rulebook detailing your brand voice, response protocols, and approved phrasing.'
      },
      {
        step: '02',
        title: 'Automated Staging & Review',
        desc: 'Content batches are loaded into our synchronized staging environment for one-click executive approval prior to rollout.'
      },
      {
        step: '03',
        title: 'Active Community Seeding',
        desc: 'Our operators actively comment on relevant industry discussions and partner accounts to channel high-intent eyeballs back to you.'
      },
      {
        step: '04',
        title: 'Monthly Performance Diagnostics',
        desc: 'We synthesize 30 days of behavioral telemetry into clear commercial directives for the subsequent production cycle.'
      }
    ],
    techStack: ['Metricool Enterprise', 'Meta Business Suite', 'YouTube Studio', 'LinkedIn Sales Navigator', 'Notion Channel CRM'],
    metrics: [
      { value: '240%', label: 'Avg Engagement Rate Uplift' },
      { value: '< 15min', label: 'First-Wave Response Velocity' },
      { value: '180%', label: 'Inbound Lead Qualified Inquiries' }
    ],
    editorial: `
### Beyond Scheduling: Active Social Operations

Most agencies treat social media management as automated buffering — queueing 10 posts on a Monday and abandoning the channel until the following week. In today's hyper-competitive social ecosystem, this guarantees stagnation.

Hyphening Media manages social channels like high-frequency trading desks. When an asset drops, the first 60 minutes determine whether the recommendation engine pushes it to thousands or millions of users.

### The Inbound Pipeline Conversion

Follower count is an ego metric; qualified conversations are enterprise revenue. Our social ops team doesn't just manage replies — we operate as an extension of your frontline business development team. By engaging engaged viewers in public comment sections and pivoting warm inquiries into confidential DMs, we convert viral reach into high-ticket pipeline.
`
  },
  {
    slug: 'web-development',
    number: '04',
    kanji: '開発',
    kanjiRomaji: 'KAIHATSU',
    title: 'Web Development',
    tagline: 'Next.js, Three.js & High-Converting Digital Flagships',
    summary: 'Bespoke web applications, high-converting digital storefronts, and immersive interactive 3D landing experiences built with React, Next.js, Three.js, and headless CMS integrations.',
    image: '/capabilities/web-development.webp',
    accentColor: '#e0231c',
    heroStat: '95+',
    heroStatLabel: 'Google Core Web Vitals Benchmark',
    deliverables: [
      {
        title: 'Custom React & Next.js Platforms',
        desc: 'High-speed, server-rendered web applications with zero unnecessary bloat and instantaneous client-side transitions.'
      },
      {
        title: 'Interactive 3D / WebGL Shaders',
        desc: 'Immersive browser experiences using custom Three.js pipelines, cloth simulations, and smooth 60fps micro-animations.'
      },
      {
        title: 'Conversion-Rate Optimized Architecture',
        desc: 'Landing page layouts engineered with proven visual hierarchies, instant form validation, and frictionless checkout flows.'
      },
      {
        title: 'Headless CMS & API Integration',
        desc: 'Empowering your marketing team with intuitive content management while preserving absolute engineering performance.'
      },
      {
        title: 'Global Edge Performance & Security',
        desc: 'Deployed on global edge CDNs with automatic SSL, DDoS protection, sub-second TTFB, and strict CSP headers.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'System Architecture & UX Prototyping',
        desc: 'We map user journeys, state structures, and design tokens in Figma before writing a single line of production code.'
      },
      {
        step: '02',
        title: 'Component Engineering & Shader Polish',
        desc: 'Modular TypeScript and React components paired with custom GPU shaders engineered for 60fps rendering.'
      },
      {
        step: '03',
        title: 'Backend Integration & Security Hardening',
        desc: 'Wiring enterprise databases, headless CMS endpoints, webhooks, and zero-trust authentication mechanisms.'
      },
      {
        step: '04',
        title: 'Audit, Optimization & Edge Launch',
        desc: 'Rigorous stress-testing against Google Lighthouse, WCAG accessibility benchmarks, and cross-browser device labs.'
      }
    ],
    techStack: ['React', 'Next.js', 'TypeScript', 'Three.js / WebGL', 'Tailwind CSS', 'PostgreSQL', 'Node.js', 'Cloudflare Edge'],
    metrics: [
      { value: '< 0.8s', label: 'First Contentful Paint (FCP)' },
      { value: '100%', label: 'Responsive Device Compatibility' },
      { value: '+38%', label: 'Average Conversion Lift Over Legacy' }
    ],
    editorial: `
### Digital Flagships Built to Command Respect

Your website is the ultimate destination where attention converts into enterprise value. A slow, cookie-cutter WordPress template destroys the premium authority built by high-end video and PR campaigns.

We engineer custom digital flagships that feel as tactile, deliberate, and high-performance as luxury hardware. Every scroll interaction, canvas cloth flutter, and typography scale is crafted with surgical obsession.

### Engineering Speed as a Growth Lever

Search engines and prospective clients have zero patience. Every 100 milliseconds of latency erodes conversion percentage. By leveraging modern edge-rendered Next.js stacks, aggressive asset compression, and GPU-accelerated canvas pipelines, our builds deliver breathtaking visual complexity without sacrificing sub-second load times.
`
  },
  {
    slug: 'app-development',
    number: '05',
    kanji: '応用',
    kanjiRomaji: 'OYO',
    title: 'App Development',
    tagline: 'iOS & Android Native Ecosystems & Cross-Platform Apps',
    summary: 'Native iOS, Android, and cross-platform mobile solutions designed for frictionless UX, push notification retention engines, and mission-critical backend scalability.',
    image: '/capabilities/app-development.webp',
    accentColor: '#e0231c',
    heroStat: '99.9%',
    heroStatLabel: 'Crash-Free Session Target',
    deliverables: [
      {
        title: 'Cross-Platform React Native & Flutter',
        desc: 'Unified codebase delivering pixel-perfect 60fps native performance across both Apple iOS and Google Android ecosystems.'
      },
      {
        title: 'Intuitive Gesture & Touch UX',
        desc: 'Ergonomic layouts designed for one-handed thumb interaction with fluid spring animations and tactical haptic feedback.'
      },
      {
        title: 'Real-Time Sync & Offline Persistence',
        desc: 'Resilient local database synchronization ensuring seamless offline utility with automatic cloud reconciliation.'
      },
      {
        title: 'Push Notification Retention Engine',
        desc: 'Segmented, event-triggered mobile notifications engineered to re-activate users without triggering app uninstalls.'
      },
      {
        title: 'App Store Optimization (ASO) & Launch',
        desc: 'Complete compliance handling, cryptographic certificate signing, metadata localization, and App Store review navigation.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Mobile Architecture & Wireframing',
        desc: 'Defining core user stories, offline database schemas, and ergonomic screen hierarchies optimized for mobile ergonomics.'
      },
      {
        step: '02',
        title: 'Agile Sprint Implementation',
        desc: 'Two-week iterative sprints with automated TestFlight builds provided directly to your team for real-time validation.'
      },
      {
        step: '03',
        title: 'Hardware & OS API Integration',
        desc: 'Native bridge integrations with biometric FaceID/TouchID, camera hardware, CoreLocation, and Apple Pay.'
      },
      {
        step: '04',
        title: 'Store Submission & Analytics Setup',
        desc: 'Full submission management to Apple App Store and Google Play, coupled with telemetry tracking cohort retention.'
      }
    ],
    techStack: ['React Native', 'Expo', 'Flutter', 'Swift / Kotlin', 'Supabase', 'Firebase Cloud Messaging', 'RevenueCat'],
    metrics: [
      { value: '99.9%', label: 'Crash-Free User Sessions' },
      { value: '4.8★', label: 'Average Client App Store Rating' },
      { value: '42%', label: 'Day-30 Cohort Retention Target' }
    ],
    editorial: `
### Native Polish for High-Retention Mobile Products

The mobile app ecosystem is unforgiving. If an app stutters during scrolling or takes more than two seconds to load, it gets deleted. Success requires native-grade responsiveness and an obsessive focus on user retention.

We design mobile products that earn a permanent place on your customer's home screen. From custom spring physics that make micro-interactions feel tactile, to intelligent background sync that ensures data is ready before the user opens the app.

### Scalable Architecture Under the Hood

A successful mobile app must handle explosive user growth without server degradation. We build mobile backends using distributed serverless architectures, real-time message brokers, and automated database sharding capable of scaling from thousands to millions of active sessions seamlessly.
`
  },
  {
    slug: 'performance-analytics',
    number: '06',
    kanji: '解析',
    kanjiRomaji: 'KAISEKI',
    title: 'Performance Analytics',
    tagline: 'Real Attribution, Conversion Funnels & CAC Optimization',
    summary: 'No vanity numbers. We build robust server-side attribution, custom BI dashboards, and funnel analytics to reveal true customer acquisition costs, lifetime value, and return on ad spend.',
    image: '/capabilities/performance-analytics.webp',
    accentColor: '#e0231c',
    heroStat: '100%',
    heroStatLabel: 'Server-Side Attribution Hygiene',
    deliverables: [
      {
        title: 'Server-Side Tracking (GTM & CAPI)',
        desc: 'Bypassing browser ad-blockers and iOS privacy restrictions with robust server-to-server data ingestion.'
      },
      {
        title: 'Custom Business Intelligence Dashboards',
        desc: 'Unified, real-time executive dashboards connecting ad spend, CRM pipeline stages, and Stripe/Shopify revenue.'
      },
      {
        title: 'Multi-Touch Attribution Modeling',
        desc: 'Uncovering the true interaction paths that drive conversions — from first organic impression to closed contract.'
      },
      {
        title: 'Cohort LTV & CAC Forensic Audits',
        desc: 'Granular unit economics tracking payback periods, customer lifetime value, and churn rates by acquisition channel.'
      },
      {
        title: 'Conversion Rate Optimization (CRO)',
        desc: 'Heatmapping, session recording analysis, and continuous A/B multivariate testing to eliminate funnel friction.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Attribution Leak Diagnostic',
        desc: 'We audit your tracking stack to identify cookie drop-offs, duplicate event fires, and unassigned revenue.'
      },
      {
        step: '02',
        title: 'Server-Side Pipeline Deployment',
        desc: 'Deploying cloud server containers with hashed customer parameters for 100% compliant, first-party data capture.'
      },
      {
        step: '03',
        title: 'BI Synthesis & Unified Data Warehousing',
        desc: 'Consolidating disparate data silos into clean, real-time dashboards accessible on desktop and mobile.'
      },
      {
        step: '04',
        title: 'Optimization Directives & Scaling',
        desc: 'Weekly strategic meetings translating raw telemetry into actionable ad spend adjustments and landing page updates.'
      }
    ],
    techStack: ['Google Tag Manager Server', 'Meta CAPI', 'GA4', 'Mixpanel', 'Looker Studio', 'PostHog', 'BigQuery'],
    metrics: [
      { value: '98%+', label: 'Attribution Match Rate' },
      { value: '-28%', label: 'Blended CAC Reduction' },
      { value: '100%', label: 'First-Party Data Ownership' }
    ],
    editorial: `
### Escaping the Vanity Metric Trap

Likes, views, and raw impressions look good on a deck, but they don't pay payroll. In an era of fractured digital consumer journeys, relying on standard browser-side pixel tracking leads to catastrophic budget misallocation.

Hyphening Media replaces guesswork with server-side forensic clarity. We track every touchpoint with cryptographic precision, giving leadership undeniable proof of which marketing channels generate true profitability.

### Data Architecture That Fuels Intelligent Scaling

When your attribution is accurate, scaling ad spend ceases to be a gamble. You know exactly what each dollar returns across 30, 60, and 90-day windows. Our analytics infrastructure gives executive teams the confidence to aggressively scale growth initiatives while competitors hesitate in the dark.
`
  },
  {
    slug: 'campaign-management',
    number: '07',
    kanji: '統合',
    kanjiRomaji: 'TOGO',
    title: 'Campaign Management',
    tagline: 'Paid Performance, Omnichannel Funnels & Scaled ROAS',
    summary: 'End-to-end paid media campaigns across Meta, Google Ads, TikTok, and YouTube — combining algorithmic bidding strategies with relentless creative A/B testing.',
    image: '/capabilities/campaign-management.png',
    accentColor: '#e0231c',
    heroStat: '5.6X',
    heroStatLabel: 'Peak Client Blended ROAS Achieved',
    deliverables: [
      {
        title: 'Omnichannel Paid Media Management',
        desc: 'Hands-on media buying across Meta (Instagram/Facebook), Google Search & YouTube, TikTok Ads, and LinkedIn.'
      },
      {
        title: 'High-Volume Creative Sandbox Testing',
        desc: 'Deploying 10 to 20 creative iterations weekly — testing hooks, visual angles, sound design, and text callouts.'
      },
      {
        title: 'Audience Segmentation & Retargeting',
        desc: 'Sophisticated exclusion funnels ensuring cold prospects, engaged viewers, and cart abandoners receive tailored messaging.'
      },
      {
        title: 'Offer Framing & Landing Page Pairing',
        desc: 'Aligning ad creative with bespoke conversion landing pages for seamless message match and higher conversion velocity.'
      },
      {
        title: 'Algorithmic Budget Scaling',
        desc: 'Systematic vertical and horizontal scaling protocols designed to increase monthly ad spend without spiking CAC.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Market Angle Analysis & Offer Architecture',
        desc: 'Dissecting target consumer pain points and packaging your service into an irresistible, low-resistance offer.'
      },
      {
        step: '02',
        title: 'Creative Matrix Build',
        desc: 'Producing a dense matrix of video ads with distinct hooks, body proofs, and calls to action.'
      },
      {
        step: '03',
        title: 'Algorithmic Sandbox Testing',
        desc: 'Deploying low-budget discovery ad sets to isolate statistical winners before committing scaled capital.'
      },
      {
        step: '04',
        title: 'Aggressive Scaling & Funnel Optimization',
        desc: 'Consolidating budget into proven creative winners while continuously iterating on fresh creative to prevent ad fatigue.'
      }
    ],
    techStack: ['Meta Ads Manager', 'Google Ads 360', 'TikTok Ads Manager', 'Triple Whale', 'Hyros', 'Stripe Sigma'],
    metrics: [
      { value: '3.8X - 5.6X', label: 'Average Campaign ROAS' },
      { value: '-32%', label: 'CPA Reduction via Creative Testing' },
      { value: '10-20', label: 'Fresh Creative Assets Tested Weekly' }
    ],
    editorial: `
### Creative is the New Targeting

The era of hyper-specific audience targeting hacks is over. Modern ad platform machine learning algorithms are smarter than human media buyers. Today, the creative asset itself does the targeting.

If your video ad features the right hook, language, and aesthetic, the algorithm will automatically find the exact buyers willing to convert. If the creative is bland, no amount of media buying tricks will save the campaign.

### The Hyphening Campaign Engine

We combine high-volume cinema-grade video production with rigorous quantitative ad management. By rapidly producing and testing varied creative angles, we identify outlier winners and scale ad spend efficiently — transforming paid acquisition from an unpredictable expense into a predictable growth machine.
`
  },
  {
    slug: 'brand-development',
    number: '08',
    kanji: '確立',
    kanjiRomaji: 'KAKURITSU',
    title: 'Brand Development',
    tagline: 'Identity Systems, Voice Guidelines & Unmistakable Positioning',
    summary: 'From strategic positioning and core narrative to typography, color tokens, and comprehensive brand books — we create unmistakable visual and verbal identities built to endure.',
    image: '/capabilities/brand-development.webp',
    accentColor: '#e0231c',
    heroStat: '100%',
    heroStatLabel: 'Bespoke Visual & Verbal System',
    deliverables: [
      {
        title: 'Brand Archetype & Positioning Matrix',
        desc: 'Defining your unique value proposition, contrarian stance, and unmistakable market positioning.'
      },
      {
        title: 'Complete Visual Identity Systems',
        desc: 'Custom logomarks, typography hierarchies, responsive lockups, and mathematically balanced color palettes.'
      },
      {
        title: 'Tone-of-Voice & Editorial Codex',
        desc: 'Definitive copywriting guidelines, vocabulary rules, headline formulas, and sample copy for internal alignment.'
      },
      {
        title: 'Digital & Physical Collateral Design',
        desc: 'High-impact investor decks, executive stationery, packaging concepts, apparel, and digital advertising templates.'
      },
      {
        title: 'Living Digital Brand Portal',
        desc: 'Cloud-accessible brand guidelines with downloadable vector assets, CSS tokens, and usage rules for your team.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Strategic Immersion & Stakeholder Interviews',
        desc: 'Uncovering the authentic founding ethos, commercial goals, and competitive landscape to establish our creative thesis.'
      },
      {
        step: '02',
        title: 'Visual Synthesis & Moodboarding',
        desc: 'Exploring contrasting aesthetic directions, typography pairings, and textural references to find the brand soul.'
      },
      {
        step: '03',
        title: 'System Construction & Vector Refinement',
        desc: 'Meticulously crafting letterforms, icon grids, color contrasts, and responsive layout rules.'
      },
      {
        step: '04',
        title: 'Codification & Enterprise Rollout',
        desc: 'Packaging the complete brand codex into an accessible digital hub and conducting training for your leadership team.'
      }
    ],
    methodologyDeliverables: ['Executive Brand Book', 'Figma Design System', 'Typography Licenses', 'Vector Asset Suite'],
    techStack: ['Figma', 'Adobe Illustrator', 'Photoshop', 'Glyphs', 'Brandfolder', 'Pitch'],
    metrics: [
      { value: '100%', label: 'Original Identity Ownership' },
      { value: 'Premium', label: 'Pricing Power Multiplier' },
      { value: 'Zero', label: 'Visual Drift Across Channels' }
    ],
    editorial: `
### Brand is What Commands the Premium

Commodities compete on price; brands command margins. In a market flooded with generic competitors, an unmistakable visual identity and cohesive verbal voice are your most defensible commercial assets.

We don't just design logos. We architect complete cultural systems. Every color code, font weight, and micro-copy phrase is chosen with psychological intent, signaling uncompromising quality and earned prestige.

### Built for Decades, Not Quarters

Trends fade rapidly; timeless design principles endure. Our brand development process draws inspiration from architectural discipline, classical typography, and modern digital minimalism. The result is an enduring visual identity that looks as fresh in ten years as it does today.
`
  },
  {
    slug: 'news-media-pr',
    number: '09',
    kanji: '広報',
    kanjiRomaji: 'KOHO',
    title: 'News Media Coverage & PR',
    tagline: 'Tier-1 Press Placements, Thought Leadership & Earned Media',
    summary: 'Earned media strategies that establish unquestioned market authority. We secure high-impact press coverage, founder profiles, podcast placements, and industry recognition.',
    image: '/capabilities/news-media-pr.webp',
    accentColor: '#e0231c',
    heroStat: 'Tier-1',
    heroStatLabel: 'Editorial & Wire Media Placements',
    deliverables: [
      {
        title: 'Targeted Tier-1 Editorial Outreach',
        desc: 'Direct, personalized pitching to senior journalists and editors at premier business, tech, and cultural publications.'
      },
      {
        title: 'Founder Profiles & Op-Ed Placements',
        desc: 'Ghostwriting and placing authoritative thought-leadership articles that establish your executive team as category leaders.'
      },
      {
        title: 'Press Release Drafting & Syndication',
        desc: 'Crafting newsworthy releases distributed through top-tier wire services for immediate search visibility and backlinks.'
      },
      {
        title: 'High-Impact Podcast & Speaking Bookings',
        desc: 'Securing guest appearances on top-charting business, industry, and entrepreneurial podcasts.'
      },
      {
        title: 'Crisis Communications & PR Shield',
        desc: 'Proactive brand protection protocols, media training, and rapid-response messaging to navigate market turbulence.'
      }
    ],
    methodology: [
      {
        step: '01',
        title: 'Newsworthy Angle Mining',
        desc: 'We analyze your company milestones, unique data insights, and founder opinions to find hooks journalists are eager to cover.'
      },
      {
        step: '02',
        title: 'Targeted Media Roster Building',
        desc: 'Curating an exclusive list of journalists who actively write about your sector, ensuring zero spam and high reply rates.'
      },
      {
        step: '03',
        title: 'Briefing & Executive Coaching',
        desc: 'Preparing founders with crisp talking points, potential interview traps, and soundbites designed for publication.'
      },
      {
        step: '04',
        title: 'Social Proof Amplification',
        desc: 'Repurposing press coverage into high-converting social proof for your website, ad campaigns, and sales decks.'
      }
    ],
    techStack: ['Muck Rack', 'Cision PR Newswire', 'HARO / Connectively', 'Google Alerts', 'Notion PR CRM'],
    metrics: [
      { value: 'Tier-1', label: 'Press Reach & Media Placements' },
      { value: 'High DA', label: 'Editorial Authority Backlinks' },
      { value: '3.5X', label: 'Inbound Sales Conversion Trust Lift' }
    ],
    editorial: `
### Earned Media: The Ultimate Trust Multiplier

Paid advertising tells the world that you are great; earned editorial coverage has respected journalists telling the world for you. That fundamental psychological difference makes high-tier PR the ultimate trust multiplier for high-ticket deals and investor credibility.

Traditional PR agencies bill hefty monthly retainers while firing blind press releases into the void. At Hyphening Media, we practice narrative journalism. We understand the specific stories editors are under pressure to file, and we deliver your company as the missing puzzle piece.

### Turning Press Wins into Compounding Revenue

A press feature that lives and dies in a single day is a wasted opportunity. We orchestrate comprehensive amplification cascades around every media win. By weaving press badges and publication quotes into landing pages, sales email sequences, and paid ad creative, we turn a single news feature into a multi-year sales catalyst.
`
  }
];

export const PILLARS_BY_SLUG = PILLARS_LIST.reduce((acc, p) => {
  acc[p.slug] = p;
  return acc;
}, {});

// ============================================================
// CAPABILITY DETAIL VIEW (/capabilities/:slug)
// ============================================================
function CapabilityDetail({ slug }) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const pillar = PILLARS_BY_SLUG[slug];

  useEffect(() => {
    if (!pillar) {
      navigate('/capabilities', { replace: true });
    }
    window.scrollTo(0, 0);
  }, [slug, pillar, navigate]);

  useEffect(() => {
    const body = document.body;
    const docEl = document.documentElement;
    const root = document.getElementById('root');
    const origBg = body.style.backgroundColor;
    const origDocBg = docEl.style.backgroundColor;
    const origColor = body.style.color;
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;

    body.style.backgroundColor = '#05070a';
    docEl.style.backgroundColor = '#05070a';
    body.style.color = '#dfe7e0';
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    body.classList.add('dark-theme');
    docEl.classList.add('dark-theme');

    return () => {
      body.style.backgroundColor = origBg;
      docEl.style.backgroundColor = origDocBg;
      body.style.color = origColor;
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
      body.classList.remove('dark-theme');
      docEl.classList.remove('dark-theme');
    };
  }, []);

  if (!pillar) return null;

  const currentIndex = PILLARS_LIST.findIndex(p => p.slug === slug);
  const prevPillar = currentIndex > 0 ? PILLARS_LIST[currentIndex - 1] : PILLARS_LIST[PILLARS_LIST.length - 1];
  const nextPillar = currentIndex < PILLARS_LIST.length - 1 ? PILLARS_LIST[currentIndex + 1] : PILLARS_LIST[0];

  const handleShare = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="landing-root blog-root blog-article-root capability-page-root">
      <SEOHead
        title={`${pillar.title} — Hyphening Media Capabilities`}
        description={pillar.summary}
        canonicalUrl={`https://hypheningmedia.com/capabilities/${pillar.slug}`}
        ogImage={pillar.image}
        ogType="article"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      {/* Hero Banner Backdrop */}
      <div className="blog-article-banner-hero">
        <div
          className="blog-article-backdrop-img"
          style={{ backgroundImage: `url(${pillar.image})` }}
        />
        <div className="blog-article-hero-mask" />
      </div>

      <div className="blog-article-wrapper">
        <article className="blog-article-card capability-detail-card">
          {/* Top navigation row */}
          <div className="blog-article-nav-row">
            <Link to="/capabilities" className="blog-back-pill">
              <ArrowLeft size={14} /> All Nine Pillars
            </Link>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleShare} className="blog-share-pill" title="Copy link">
                {copied ? (<><Check size={14} color="#10b981" /> Link Copied</>) : (<><Share2 size={14} /> Share</>)}
              </button>
            </div>
          </div>

          {/* Header */}
          <header className="blog-article-header">
            <div className="blog-article-meta-tags">
              <span className="blog-card-category-badge" style={{ borderColor: 'rgba(224, 35, 28, 0.4)', color: '#ff6b64' }}>
                PILLAR {pillar.number} · {pillar.kanji}
              </span>
              <span className="blog-article-meta-item" style={{ letterSpacing: '0.2em', textTransform: 'uppercase', color: '#909b95' }}>
                {pillar.kanjiRomaji}
              </span>
            </div>

            <h1 className="blog-article-main-title">{pillar.title}</h1>
            <p className="capability-tagline-text">{pillar.tagline}</p>
            <p className="blog-article-lead-excerpt">{pillar.summary}</p>
          </header>

          {/* Featured Visual Frame */}
          <div className="blog-article-featured-img-wrap capability-hero-frame">
            <img src={pillar.image} alt={pillar.title} className="blog-article-featured-img" />
            <div className="capability-frame-overlay">
              <span className="capability-frame-badge">Pillar {pillar.number}</span>
              <span className="capability-frame-kanji">{pillar.kanji}</span>
            </div>
          </div>

          {/* Performance Targets Grid */}
          <div className="capability-stats-strip">
            {pillar.metrics.map((m, idx) => (
              <div key={idx} className="capability-stat-card">
                <div className="capability-stat-val">{m.value}</div>
                <div className="capability-stat-lbl">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Key Deliverables Section */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Layers size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                CORE DELIVERABLES
              </span>
              <h2 className="capability-sec-title">What We Engineer & Deliver</h2>
            </div>

            <div className="capability-deliverables-grid">
              {pillar.deliverables.map((item, idx) => (
                <div key={idx} className="capability-deliverable-item">
                  <div className="capability-item-check">
                    <Check size={14} color="#e0231c" />
                  </div>
                  <div className="capability-item-body">
                    <h4 className="capability-item-title">{item.title}</h4>
                    <p className="capability-item-desc">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Execution Methodology */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Compass size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                METHODOLOGY & WORKFLOW
              </span>
              <h2 className="capability-sec-title">Systematic Execution Flow</h2>
            </div>

            <div className="capability-methodology-timeline">
              {pillar.methodology.map((step, idx) => (
                <div key={idx} className="capability-methodology-step">
                  <div className="capability-step-num">{step.step}</div>
                  <div className="capability-step-content">
                    <h4 className="capability-step-title">{step.title}</h4>
                    <p className="capability-step-desc">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Tech Stack & Tooling */}
          <section className="capability-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Cpu size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                TOOLING & INFRASTRUCTURE
              </span>
              <h2 className="capability-sec-title">Production Stack</h2>
            </div>

            <div className="capability-stack-pills">
              {pillar.techStack.map((tool, idx) => (
                <span key={idx} className="capability-stack-pill">
                  {tool}
                </span>
              ))}
            </div>
          </section>

          {/* Editorial Philosophy */}
          <section className="capability-section capability-editorial-section">
            <div className="capability-sec-heading">
              <span className="capability-sec-k">
                <Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: '6px', color: '#e0231c' }} />
                DEEP DIVE
              </span>
              <h2 className="capability-sec-title">The Hyphening Standard</h2>
            </div>

            <div
              className="blog-article-prose"
              dangerouslySetInnerHTML={{
                __html: pillar.editorial
                  .replace(/^### (.+)$/gm, '<h3 class="blog-h3">$1</h3>')
                  .replace(/^## (.+)$/gm, '<h2 class="blog-h2">$1</h2>')
                  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\*(.+?)\*/g, '<em>$1</em>')
                  .replace(/(<li class="blog-li">.*<\/li>\n?)+/g, '<ul class="blog-ul">$&</ul>')
                  .replace(/^\d+\. (.+)$/gm, '<li class="blog-li-num">$1</li>')
                  .replace(/^- (.+)$/gm, '<li class="blog-li">$1</li>')
                  .replace(/\n\n/g, '</p><p class="blog-p">')
              }}
            />
          </section>

          {/* Bottom Partnership Box */}
          <div className="capability-cta-box">
            <div className="capability-cta-content">
              <span className="capability-cta-badge">INTEGRATE THIS DISCIPLINE</span>
              <h3 className="capability-cta-title">Ready to deploy {pillar.title} into your growth engine?</h3>
              <p className="capability-cta-desc">
                Partner with Hyphening Media for full-spectrum execution with zero overhead. Let's discuss your targets.
              </p>
            </div>
            <a href="/#eternity" className="capability-cta-btn">
              <span>Initiate Partnership</span>
              <ArrowRight size={16} />
            </a>
          </div>

          {/* Next / Previous Pillar Navigation */}
          <div className="capability-prev-next-nav">
            <Link to={`/capabilities/${prevPillar.slug}`} className="capability-nav-card prev">
              <div className="capability-nav-dir">
                <ArrowLeft size={13} /> PREVIOUS PILLAR
              </div>
              <div className="capability-nav-title">
                <span className="kanji">{prevPillar.kanji}</span> {prevPillar.title}
              </div>
            </Link>

            <Link to={`/capabilities/${nextPillar.slug}`} className="capability-nav-card next">
              <div className="capability-nav-dir">
                NEXT PILLAR <ArrowRight size={13} />
              </div>
              <div className="capability-nav-title">
                {nextPillar.title} <span className="kanji">{nextPillar.kanji}</span>
              </div>
            </Link>
          </div>
        </article>
      </div>

      <Footer />
    </div>
  );
}

// ============================================================
// CAPABILITIES LISTING VIEW (/capabilities)
// ============================================================
function CapabilitiesListing() {
  useEffect(() => {
    const body = document.body;
    const docEl = document.documentElement;
    const root = document.getElementById('root');
    const origBg = body.style.backgroundColor;
    const origDocBg = docEl.style.backgroundColor;
    const origColor = body.style.color;
    const origBodyPad = body.style.padding;
    const origRootMax = root.style.maxWidth;

    body.style.backgroundColor = '#05070a';
    docEl.style.backgroundColor = '#05070a';
    body.style.color = '#dfe7e0';
    body.style.padding = '0';
    root.style.maxWidth = 'none';
    body.classList.add('dark-theme');
    docEl.classList.add('dark-theme');

    return () => {
      body.style.backgroundColor = origBg;
      docEl.style.backgroundColor = origDocBg;
      body.style.color = origColor;
      body.style.padding = origBodyPad;
      root.style.maxWidth = origRootMax;
      body.classList.remove('dark-theme');
      docEl.classList.remove('dark-theme');
    };
  }, []);

  return (
    <div className="landing-root blog-root">
      <SEOHead
        title="Nine Pillars of Growth — Hyphening Media Capabilities"
        description="Nine core disciplines engineered for full-spectrum execution, viral distribution, and real enterprise ROI — from cinema production to custom software."
        canonicalUrl="https://hypheningmedia.com/capabilities"
      />

      <div className="blog-ambient-mesh" />
      <div className="blog-vignette" />
      <Navbar />

      <header className="blog-hero-section">
        <div className="blog-hero-content">
          <div className="blog-eyebrow">
            <span className="blog-eyebrow-dot" />
            <span>NINE PILLARS · 全方位実行</span>
          </div>
          <h1 className="blog-display-title">
            Our <span className="blog-title-accent">Capabilities</span>
          </h1>
          <p className="blog-hero-desc">
            Nine core disciplines engineered for full-spectrum execution, viral distribution, and real enterprise ROI — from cinema production to custom software.
          </p>
        </div>
      </header>

      <main className="blog-main-section">
        <div className="capabilities-listing-grid">
          {PILLARS_LIST.map((pillar) => (
            <Link
              key={pillar.slug}
              to={`/capabilities/${pillar.slug}`}
              className="capability-listing-card"
            >
              <div className="capability-card-img-wrap">
                <img
                  src={pillar.image}
                  alt={pillar.title}
                  className="capability-card-img"
                  loading="lazy"
                />
                <div className="capability-card-overlay" />
                <span className="capability-card-badge">{pillar.number}</span>
                <span className="capability-card-kanji">{pillar.kanji}</span>
                <span className="capability-card-arrow">
                  <ArrowRight size={16} />
                </span>
              </div>

              <div className="capability-card-content">
                <div className="capability-card-top">
                  <span className="capability-card-tag">Pillar {pillar.number}</span>
                  <span className="capability-card-romaji">{pillar.kanjiRomaji}</span>
                </div>
                <h3 className="capability-card-title">{pillar.title}</h3>
                <p className="capability-card-desc">{pillar.summary}</p>

                <div className="capability-card-footer">
                  <span className="capability-card-link-text">
                    Explore Discipline
                  </span>
                  <ArrowRight size={14} className="capability-card-footer-icon" />
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Global CTA Section */}
        <div className="capabilities-bottom-cta">
          <div className="capabilities-bottom-cta-inner">
            <span className="capability-cta-badge">ARCHITECT YOUR ENGINE</span>
            <h2>Execute across all nine pillars seamlessly.</h2>
            <p>
              Whether you need end-to-end management or surgical execution in a single discipline, our team delivers predictable, high-impact growth.
            </p>
            <div style={{ marginTop: '24px' }}>
              <a href="/#eternity" className="capability-cta-btn">
                <span>Start a Conversation</span>
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

// ============================================================
// MAIN CAPABILITIES COMPONENT ROUTER
// ============================================================
export default function Capabilities() {
  const { slug } = useParams();
  return slug ? <CapabilityDetail slug={slug} /> : <CapabilitiesListing />;
}
