import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ImageResponse } from '@vercel/og';
import React from 'react';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { iconMap } from '../src/components/ui/icons/icons.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const searchParams = url.searchParams;

    // Extract params
    const id = searchParams.get('id');

    if (!id) {
      res.status(400).send('Missing id parameter');
      return;
    }

    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) {
      throw new Error('NEXT_PUBLIC_CONVEX_URL is not set');
    }
    const convex = new ConvexHttpClient(convexUrl);

    const questionInfo: any = await convex.query(api.core.questions.getQuestionForOgImage, { id: id as any });

    if (!questionInfo) {
      res.status(404).send('Question not found');
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

    const StyleIcon = iconMap[styleIcon] || iconMap['CircleQuestionMark'];
    const ToneIcon = iconMap[toneIcon] || iconMap['CircleQuestionMark'];

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
          backgroundColor: 'white',
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
            padding: '20px',
            background: `linear-gradient(135deg, ${gradientEnd}, ${gradientStart})`, // Tone to Style
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        // Inner Content (White Card)
        React.createElement(
          'div',
          {
            style: {
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%', // Fill the container (minus padding)
              backgroundColor: 'rgba(255, 255, 255, 0.95)',
              borderRadius: '40px',
              padding: '60px',
              justifyContent: 'space-between',
              boxShadow: '0 20px 50px rgba(0,0,0,0.15)',
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
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  padding: '12px 24px',
                  borderRadius: '999px',
                  borderTopWidth: '4px',
                  borderTopStyle: 'solid',
                  borderTopColor: styleColor,
                  borderLeftWidth: '4px',
                  borderLeftStyle: 'solid',
                  borderLeftColor: styleColor,
                  gap: '12px',
                },
              },
              React.createElement(StyleIcon, { size: 32, color: styleColor }),
              React.createElement(
                'span',
                { style: { fontSize: '24px', fontWeight: 700, color: '#374151' } },
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
                  backgroundColor: 'rgba(0,0,0,0.05)',
                  padding: '12px 24px',
                  borderRadius: '999px',
                  borderBottomWidth: '4px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: toneColor,
                  borderRightWidth: '4px',
                  borderRightStyle: 'solid',
                  borderRightColor: toneColor,
                  gap: '12px',
                },
              },
              React.createElement(ToneIcon, { size: 32, color: toneColor }),
              React.createElement(
                'span',
                { style: { fontSize: '24px', fontWeight: 700, color: '#374151' } },
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
                  color: '#111827',
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
    );

    const imageResponse = new ImageResponse(element, {
      width: 1080,
      height: 1080,
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
