'use client';

import AccountTreeIcon from '@mui/icons-material/AccountTree';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AddIcon from '@mui/icons-material/Add';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import DescriptionIcon from '@mui/icons-material/Description';
import ErrorIcon from '@mui/icons-material/Error';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FavoriteIcon from '@mui/icons-material/Favorite';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FilterAltIcon from '@mui/icons-material/FilterAlt';
import HomeIcon from '@mui/icons-material/Home';
import LinkIcon from '@mui/icons-material/Link';
import ListAltIcon from '@mui/icons-material/ListAlt';
import LocationOffIcon from '@mui/icons-material/LocationOff';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import SettingsIcon from '@mui/icons-material/Settings';
import SyncIcon from '@mui/icons-material/Sync';

const icons = {
  account: AccountCircleIcon,
  add: AddIcon,
  arrowBack: ArrowBackIcon,
  arrowForward: ArrowForwardIcon,
  autoAwesome: AutoAwesomeIcon,
  chevronLeft: ChevronLeftIcon,
  chevronRight: ChevronRightIcon,
  close: CloseIcon,
  draft: DescriptionIcon,
  error: ErrorIcon,
  expandMore: ExpandMoreIcon,
  favorite: FavoriteIcon,
  favoriteBorder: FavoriteBorderIcon,
  filter: FilterAltIcon,
  home: HomeIcon,
  link: LinkIcon,
  list: ListAltIcon,
  locationOff: LocationOffIcon,
  logout: LogoutIcon,
  process: AccountTreeIcon,
  search: SearchIcon,
  settings: SettingsIcon,
  sync: SyncIcon
} as const;

export type MaterialIconName = keyof typeof icons;

export function MaterialIcon({ name }: { name: MaterialIconName }) {
  const Icon = icons[name];
  return <Icon className="material-icon" aria-hidden="true" focusable="false" />;
}
