import {
  Activity, AlarmClock, Album, AppWindow, Archive, AudioLines, Banknote, BarChart3,
  Bell, Book, Bookmark, Boxes, Brain, Briefcase, Bug, Calendar, Camera, Cast,
  CheckSquare, Clapperboard, Clock, Cloud, CloudDownload, Code, Cog,
  Compass, Container, Cpu, CreditCard, Database, Disc, DollarSign, Download,
  Droplet, FileText, Film, Flame, Folder, FolderOpen, Gamepad2, Gauge, Ghost,
  // NB: lucide exports PieChart, not ChartPie — the latter is a newer alias.
  Gift, Github, Globe, HardDrive, Headphones, Heart, Home, Image, Inbox, Key,
  Landmark, Laptop, LayoutDashboard, LayoutGrid, Library, LifeBuoy, LineChart,
  Link, List, Lock, Mail, Map, MessageSquare, Mic, Monitor, Moon, Music, Network,
  Newspaper, Package, Palette, Paperclip, PenTool, Phone, PieChart, PlayCircle,
  Podcast, Power, Printer, Puzzle, Radio, RefreshCw, Rocket, Rss, Save, Scan,
  Search, Send, Server, Settings, Share2, Shield, ShieldCheck, ShoppingCart,
  Shuffle, Signal, Smartphone, Speaker, Star, Sun, Tag, Terminal, Thermometer,
  Ticket, Timer, ToggleLeft, Tv, Upload, User, Users, Video, Wallet, Wifi,
  Wrench, Youtube, Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * A curated subset of lucide, imported by name so the bundler tree-shakes it.
 *
 * The landing page renders icons on the SERVER and can therefore use lucide's
 * full barrel — any icon name works there. This list exists only so the admin
 * picker can show live previews client-side without dragging in all ~1500
 * icons (~60kB+). The picker also accepts a free-typed name for anything here.
 */
export const ICON_CATALOG: Record<string, LucideIcon> = {
  activity: Activity, "alarm-clock": AlarmClock, album: Album, "app-window": AppWindow,
  archive: Archive, "audio-lines": AudioLines, banknote: Banknote, "bar-chart-3": BarChart3,
  bell: Bell, book: Book, bookmark: Bookmark, boxes: Boxes, brain: Brain,
  briefcase: Briefcase, bug: Bug, calendar: Calendar, camera: Camera, cast: Cast,
  "check-square": CheckSquare, clapperboard: Clapperboard,
  clock: Clock, cloud: Cloud, "cloud-download": CloudDownload, code: Code, cog: Cog,
  compass: Compass, container: Container, cpu: Cpu, "credit-card": CreditCard,
  database: Database, disc: Disc, "dollar-sign": DollarSign, download: Download,
  droplet: Droplet, "file-text": FileText, film: Film, flame: Flame, folder: Folder,
  "folder-open": FolderOpen, "gamepad-2": Gamepad2, gauge: Gauge, ghost: Ghost,
  gift: Gift, github: Github, globe: Globe, "hard-drive": HardDrive,
  headphones: Headphones, heart: Heart, home: Home, image: Image, inbox: Inbox,
  key: Key, landmark: Landmark, laptop: Laptop, "layout-dashboard": LayoutDashboard,
  "layout-grid": LayoutGrid, library: Library, "life-buoy": LifeBuoy,
  "line-chart": LineChart, link: Link, list: List, lock: Lock, mail: Mail, map: Map,
  "message-square": MessageSquare, mic: Mic, monitor: Monitor, moon: Moon,
  music: Music, network: Network, newspaper: Newspaper, package: Package,
  palette: Palette, paperclip: Paperclip, "pen-tool": PenTool, phone: Phone,
  "pie-chart": PieChart, "play-circle": PlayCircle, podcast: Podcast, power: Power,
  printer: Printer, puzzle: Puzzle, radio: Radio, "refresh-cw": RefreshCw,
  rocket: Rocket, rss: Rss, save: Save, scan: Scan, search: Search, send: Send,
  server: Server, settings: Settings, "share-2": Share2, shield: Shield,
  "shield-check": ShieldCheck, "shopping-cart": ShoppingCart, shuffle: Shuffle,
  signal: Signal, smartphone: Smartphone, speaker: Speaker, star: Star, sun: Sun,
  tag: Tag, terminal: Terminal, thermometer: Thermometer, ticket: Ticket,
  timer: Timer, "toggle-left": ToggleLeft, tv: Tv, upload: Upload, user: User,
  users: Users, video: Video, wallet: Wallet, wifi: Wifi, wrench: Wrench,
  youtube: Youtube, zap: Zap,
};

export const ICON_NAMES = Object.keys(ICON_CATALOG);
