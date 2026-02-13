import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageResponse } from '@vercel/og';
import React from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { iconPathMap } from './lib/icon-paths.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const searchParams = url.searchParams;

    // Extract params
    const id = searchParams.get('id')?.trim();

    if (!id) {
      res.status(400).send('Missing id parameter');
      return;
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
    }
    const convex = new ConvexHttpClient(convexUrl.trim());

    const questionInfo: any = await convex.query(api.core.questions.getQuestionForOgImage, { id: id as any });

    if (!questionInfo) {
      res.status(404).send('Question not found ' + id + ' at ' + convexUrl);
      return;
    }

    const {
      text,
      styleName,
      styleColor,
      styleIcon,
      toneName,
      toneColor,
      toneIcon,
      gradientStart,
      gradientEnd
    } = questionInfo;

    // Look up raw SVG path data for icons (lucide-react components use forwardRef
    // which Satori cannot render — we must use raw SVG elements instead)
    const getIconPaths = (name: string) => {
      if (!name) return iconPathMap['CircleHelp'];
      return iconPathMap[name] ||
             Object.entries(iconPathMap).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1] ||
             iconPathMap['CircleHelp'];
    };

    const styleIconPaths = getIconPaths(styleIcon);
    const toneIconPaths = getIconPaths(toneIcon);

    // Render an icon as a raw SVG element from path data
    const renderIcon = (paths: [string, Record<string, string>][] | undefined, color: string) => {
      const iconPaths = paths || iconPathMap['CircleHelp'];
      return React.createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          width: '32',
          height: '32',
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: color,
          strokeWidth: '2',
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          style: { width: 32, height: 32, flexShrink: 0 },
        },
        ...iconPaths.map(([tag, attrs], i) =>
          React.createElement(tag, { ...attrs, key: String(i) })
        )
      );
    };

    const element = React.createElement(
      'div',
      {
        style: {
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#111827f2',
        },
      },
      // Card Container (Full Bleed with gradient)
      React.createElement(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            padding: '60px',
            background: `linear-gradient(135deg, ${gradientEnd}, ${gradientStart})`, // Tone to Style
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              width: '100%',
              height: '100%', 
              borderRadius: '43px',
              padding: '6px',
              background: `linear-gradient(135deg, ${gradientStart}, ${gradientEnd})`,
            },
          },
          // Inner Content (Card)
          React.createElement(
            'div',
            {
              style: {
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%', // Fill the container (minus padding)
                backgroundColor: '#111827f2',
                borderRadius: '37px',
                padding: '60px',
                justifyContent: 'space-between',
              },
            },
            // Header / Badges Row
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  width: '100%',
                },
              },
              // Style Badge (Left)
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    padding: '12px 24px',
                    borderRadius: '999px',
                    borderTopWidth: '4px',
                    borderTopStyle: 'solid',
                    borderTopColor: styleColor,
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: styleColor,
                  },
                },
                React.createElement(
                  'div',
                  { 
                    style: { 
                      display: 'flex', 
                      width: '32px', 
                      height: '32px', 
                      marginRight: '12px',
                      alignItems: 'center',
                      justifyContent: 'center'
                    } 
                  },
                  renderIcon(styleIconPaths, styleColor)
                ),
                React.createElement(
                  'span',
                  { style: { fontSize: '24px', fontWeight: 700, color: 'white' } },
                  styleName
                )
              ),
              // Tone Badge (Right)
              React.createElement(
                'div',
                {
                  style: {
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.2)',
                    padding: '12px 24px',
                    borderRadius: '999px',
                    borderBottomWidth: '4px',
                    borderBottomStyle: 'solid',
                    borderBottomColor: toneColor,
                    borderRightWidth: '4px',
                    borderRightStyle: 'solid',
                    borderRightColor: toneColor,
                  },
                },
                React.createElement(
                  'div',
                  { 
                    style: { 
                      display: 'flex', 
                      width: '32px', 
                      height: '32px', 
                      marginRight: '12px',
                      alignItems: 'center',
                      justifyContent: 'center'
                    } 
                  },
                  renderIcon(toneIconPaths, toneColor)
                ),
                React.createElement(
                  'span',
                  { style: { fontSize: '24px', fontWeight: 700, color: 'white' } },
                  toneName
                )
              )
            ),
            // Main Text
            React.createElement(
              'div',
              {
                style: {
                  display: 'flex',
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '40px',
                  textAlign: 'center',
                },
              },
              React.createElement(
                'h2',
                {
                  style: {
                    fontSize: text.length > 100 ? '56px' : '72px', // Dynamic font size
                    fontWeight: 800,
                    color: 'white',
                    lineHeight: 1.3,
                    margin: 0,
                    letterSpacing: '-0.02em',
                  },
                },
                text
              )
            ),
            // Empty footer spacer to balance layout (or could be removed if flex layout handles it well)
            React.createElement('div', { style: { height: '60px' } })
          )          
        )
      )
    );

    const imageResponse = new ImageResponse(element, {
      width: 1080,
      height: 1350,
    });

    // Convert the ImageResponse to a buffer and send it
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200).send(buffer);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    console.log(message);
    res.status(500).send('Failed to generate the image');
  }
}
