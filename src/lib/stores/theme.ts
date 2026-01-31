import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

function createThemeStore() {
	const { subscribe, set } = writable<Theme>('dark'); // Dark mode is default

	if (browser) {
		// Set dark mode attribute on page load
		document.documentElement.setAttribute('theme', 'dark');
	}

	return {
		subscribe,
		setTheme: (theme: Theme) => {
			set(theme);
			if (browser) {
				document.documentElement.setAttribute('theme', theme);
				localStorage.setItem('shooter_theme', theme);
			}
		},
		toggleTheme: () => {
			if (browser) {
				const current = document.documentElement.getAttribute('theme') as Theme;
				const newTheme = current === 'dark' ? 'light' : 'dark';
				document.documentElement.setAttribute('theme', newTheme);
				localStorage.setItem('shooter_theme', newTheme);
				set(newTheme);
			}
		}
	};
}

export const theme = createThemeStore();
