<?php
/**
 * Plugin Name: Komendly Free Ads Widget
 * Description: Adds a [komendly_ads] shortcode: a small "Make ads from your website" box that opens Komendly's free ad pack page. No account, no tracking cookies, no data stored by this plugin.
 * Version: 1.0.0
 * Author: Komendly
 * Author URI: https://www.komendly.com
 * License: GPLv2 or later
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: komendly-free-ads
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * [komendly_ads partner="your-site"] -> the same widget as https://www.komendly.com/developers/embed.
 * "partner" is a lowercase tag (letters, digits, - _) that only labels where visitors came from.
 */
function komendly_free_ads_shortcode( $atts ) {
	$atts    = shortcode_atts( array( 'partner' => 'wordpress' ), $atts, 'komendly_ads' );
	$partner = strtolower( preg_replace( '/[^a-z0-9_-]/i', '', (string) $atts['partner'] ) );
	if ( '' === $partner || strlen( $partner ) > 40 ) {
		$partner = 'wordpress';
	}
	return '<div data-komendly-embed data-partner="' . esc_attr( $partner ) . '"></div>'
		. '<script async src="https://www.komendly.com/embed/komendly-embed.js"></script>';
}
add_shortcode( 'komendly_ads', 'komendly_free_ads_shortcode' );
