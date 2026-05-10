// supabase/functions/scraper/index.ts
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12'
import { corsHeaders } from '../_shared/cors.ts'
import { supabase } from '../_shared/supabase.ts'

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const clientIp = req.headers.get('x-forwarded-for') || 'Unknown IP'
  const body = await req.json().catch(() => ({}))
  const { cookie, secret } = body

  if (secret !== Deno.env.get('MY_SECRET_SCRAPER_KEY')) {
    console.warn('Unauthorized scraper access:', clientIp)
    return json({ success: false, error: 'Forbidden' }, 403)
  }

  try {
    if (!cookie) {
      return json({ success: false, error: 'Missing cookie' }, 400)
    }

    const headers = {
      Cookie: cookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'vi,fr-FR;q=0.9,fr;q=0.8,en-US;q=0.7,en;q=0.6',
      Connection: 'keep-alive',
      Referer: 'https://online.hub.edu.vn/',
    }

    async function fetchHtml(url: string) {
      const res = await fetch(url, { headers })
      return await res.text()
    }

    async function fetchMssvFromUrl(url: string) {
      try {
        const html = await fetchHtml(url)

        if (html.includes('Đăng nhập') || html.includes('Object moved')) {
          return 'COOKIE_DEAD'
        }

        const $ = cheerio.load(html)
        let mssv: string | null = null

        $('table tr').each((_i, row) => {
          const tds = $(row).children('td')
          if (tds.length >= 2) {
            const text = $(tds[1]).text().trim()
            if (/^\d{8,15}$/.test(text)) {
              mssv = text
              return false
            }
          }
          return undefined
        })

        return mssv
      } catch (error) {
        console.warn('Fetch MSSV failed:', url, error)
        return null
      }
    }

    async function getInstructorFromStudentSchedule(mssv: string, targetCourseCode: string) {
      try {
        const url = `https://online.hub.edu.vn/Print_.aspx?NH=2025-2026&HK=HK02&StudentID=${mssv}`
        const html = await fetchHtml(url)
        const $ = cheerio.load(html)
        let instructor = ''
        const baseCode = targetCourseCode.split('_')[0]
        const tailCode = targetCourseCode.split('_').pop()

        $('table tr').each((_i, row) => {
          const tds = $(row).children('td')
          if (tds.length >= 7) {
            const tdMaHP = $(tds[1]).text().trim()
            if (tdMaHP.includes(baseCode) && tdMaHP.includes(tailCode || '')) {
              const teacherName = $(tds[6]).text().trim()
              if (teacherName && !teacherName.includes('()') && !teacherName.includes('Thứ')) {
                instructor = teacherName
              }
              return false
            }
          }
          return undefined
        })

        return instructor
      } catch (error) {
        console.warn('Fetch instructor failed:', targetCourseCode, error)
        return ''
      }
    }

    console.log('Start instructor scraper:', { ip: clientIp })

    const { data: courses, error } = await supabase
      .from('course_schedules')
      .select('id, course_code')
      .eq('semester', 'HK2_2025_2026')
      .or('instructor.eq.,instructor.is.null')
      .limit(10)

    if (error) return json({ success: false, error: error.message }, 500)
    if (!courses || courses.length === 0) {
      return json({ success: true, message: 'No courses need instructor update.' })
    }

    let successCount = 0
    const resultsLog: string[] = []

    for (const course of courses) {
      const originalCode = course.course_code
      let mssv: string | null = null
      const urlsToTry: string[] = []
      const parts = originalCode.split('_')

      if (originalCode.startsWith('GYM') && parts.length >= 3) {
        const p0 = parts[0]
        const p1 = parts[1]
        const pLast = parts[parts.length - 1]
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}_1_${pLast}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}_2_${pLast}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${encodeURIComponent(originalCode)}`)
      } else if (parts.length >= 3) {
        const p0 = parts[0]
        const p1 = parts[1]
        const pRest = parts.slice(2).join('_')
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}_1_${pRest}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}1_1_${pRest}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}_2_${pRest}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${p0}_${p1}2_2_${pRest}`)
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${encodeURIComponent(originalCode)}`)
      } else {
        urlsToTry.push(`https://online.hub.edu.vn/Liststudentinschedulestudyunit.aspx?SchduleStudyUnitId=${encodeURIComponent(originalCode)}`)
      }

      for (const url of urlsToTry) {
        mssv = await fetchMssvFromUrl(url)
        if (mssv === 'COOKIE_DEAD') break
        if (mssv) break
        await delay(500)
      }

      await delay(500)

      if (mssv === 'COOKIE_DEAD') {
        return json({ success: false, error: 'Cookie expired. Please refresh HUB cookie.' }, 401)
      }

      if (mssv) {
        const instructorName = await getInstructorFromStudentSchedule(mssv, course.course_code)
        await delay(800)

        if (instructorName && instructorName.length > 3) {
          const { error: updateError } = await supabase
            .from('course_schedules')
            .update({ instructor: instructorName })
            .eq('id', course.id)

          if (!updateError) {
            successCount += 1
            resultsLog.push(`[OK] ${course.course_code} -> ${instructorName}`)
          } else {
            resultsLog.push(`[DB_ERROR] ${course.course_code}`)
          }
        } else {
          await supabase.from('course_schedules').update({ instructor: 'Chưa xếp GV' }).eq('id', course.id)
          resultsLog.push(`[NO_INSTRUCTOR] ${course.course_code}`)
        }
      } else {
        await supabase.from('course_schedules').update({ instructor: 'Lớp Hủy/Trống' }).eq('id', course.id)
        resultsLog.push(`[EMPTY_CLASS] ${course.course_code}`)
      }
    }

    return json({
      success: true,
      message: `Finished scraper. Updated ${successCount}/${courses.length} courses.`,
      logs: resultsLog,
    })
  } catch (error) {
    console.error('Scraper failed:', error)
    return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
