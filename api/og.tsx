import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

// Map commonly used icons to SVGs (simplified for OG)
// Since we can't easily import the complex react components, we will use basic SVGs for the icons
// or just omit them if they are too complex.
// For now, I'll put placeholders. To make this robust, we should probably fetch the icons or
// embed the SVGs directly.

export default async function handler(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // Extract params
    const text = searchParams.get('text');
    const styleName = searchParams.get('styleName') || 'General';
    const styleColor = searchParams.get('styleColor') || '#000000';
    // We can pass gradient colors as params or default
    const gradientStart = searchParams.get('gradientStart') || '#f0f0f0';
    const gradientEnd = searchParams.get('gradientEnd') || '#d0d0d0';
    const toneName = searchParams.get('toneName') || 'Casual';
    const toneColor = searchParams.get('toneColor') || '#000000';

    if (!text) {
      return new Response('Missing text parameter', { status: 400 });
    }

    // Replicate ModernQuestionCard design
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'white',
            padding: '40px',
          }}
        >
          {/* Card Container */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              borderRadius: '30px',
              padding: '3px',
              background: `linear-gradient(135deg, ${gradientEnd}, ${gradientStart})`,
            }}
          >
            {/* Inner Content */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '27px',
                padding: '32px',
                justifyContent: 'space-between',
              }}
            >
              {/* Header / Badges */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                 {/* Style Badge */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    padding: '8px 16px',
                    borderRadius: '999px',
                    borderTop: `2px solid ${gradientStart}`,
                    borderLeft: `2px solid ${gradientStart}`,
                    gap: '8px',
                  }}
                >
                   {/* Icon placeholder (circle) */}
                   <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: styleColor }} />
                   <span style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{styleName}</span>
                </div>

                {/* Tone Badge */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: 'rgba(0,0,0,0.1)',
                    padding: '8px 16px',
                    borderRadius: '999px',
                    borderBottom: `2px solid ${gradientEnd}`,
                    borderRight: `2px solid ${gradientEnd}`,
                    gap: '8px',
                  }}
                >
                   {/* Icon placeholder (circle) */}
                   <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: toneColor }} />
                   <span style={{ fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>{toneName}</span>
                </div>
              </div>

              {/* Main Text */}
              <div
                style={{
                  display: 'flex',
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <h2
                  style={{
                    fontSize: '48px',
                    fontWeight: 'bold',
                    color: '#111827',
                    lineHeight: 1.4,
                    margin: 0,
                  }}
                >
                  {text}
                </h2>
              </div>

              {/* Footer / Branding */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: 0.5,
                }}
              >
                  <span style={{ fontSize: '16px', color: '#4b5563' }}>@IcebergBreaker</span>
              </div>
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      },
    );
  } catch (e: any) {
    console.log(`${e.message}`);
    return new Response(`Failed to generate the image`, {
      status: 500,
    });
  }
}
