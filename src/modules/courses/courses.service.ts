import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';
import { CreateCourseSessionDto } from './dto/create-course-session.dto';
import { AssignParticipantsDto } from './dto/assign-participants.dto';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from 'src/common/utils/encryption.util';
import { RegisterAttendanceDto } from './dto/register-attendance.dto';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(
    private prismaService: PrismaService,
    private readonly configService: ConfigService,
    private readonly cryptoService: EncryptionService,
  ) { }

  // Esta función crea un nuevo curso en el catálogo de la empresa
  async create(companyId: number, createCourseDto: CreateCourseDto, user: ActiveUserDto) {
    // Verificar si el curso ya existe en el catálogo de la empresa
    const existingCourse = await this.prismaService.catCursos.findFirst({
      where: {
        idEmpresa: companyId,
        Descripcion: createCourseDto.Descripcion,
        idArea: createCourseDto.idArea,
        idTipoCurso: createCourseDto.idTipoCurso,
      },
    });

    if (existingCourse) {
      throw new Error('El curso que quieres crear ya existe en el catálogo de la empresa');
    }

    // Crear el nuevo curso
    const course = await this.prismaService.catCursos.create({
      data: {
        Descripcion: createCourseDto.Descripcion,
        idArea: createCourseDto.idArea,
        idTipoCurso: createCourseDto.idTipoCurso,
        activo: true,
        idEmpresa: companyId,
      },
    });

    // Registrar el movimiento en el histórico
    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'CREATE',
        tablaOrigen: 'CatCursos',
        idRegistro: String(course.idCursos),
        descripcion: `Curso "${createCourseDto.Descripcion}" creado por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date()
      }
    });

    return course;
  }

  // Esta función obtiene todos los cursos de una empresa paginados
  async findAll(companyId: number, page: number, limit: number, search: string) {
    const skip = (page - 1) * limit;

    // Condición base de búsqueda por empresa
    const whereCondition: any = {
      idEmpresa: companyId,
    };

    // Filtro de búsqueda por descripción del curso, tipo de curso o área
    if (search) {
      whereCondition.OR = [
        { Descripcion: { contains: search } },
        { CatTipoCurso: { Descripcion: { contains: search } } },
        { CatAreas: { Descripcion: { contains: search } } },
      ];
    }

    const [courses, total] = await Promise.all([
      this.prismaService.catCursos.findMany({
        where: whereCondition,
        include: {
          CatTipoCurso: {
            select: {
              idTipoCurso: true,
              Descripcion: true,
            },
          },
          CatAreas: {
            select: {
              idArea: true,
              Descripcion: true,
            },
          },
        },
        skip: skip,
        take: limit,
        orderBy: { idCursos: 'desc' },
      }),
      this.prismaService.catCursos.count({ where: whereCondition }),
    ]);

    // Si no hay cursos en la primera página y no hay filtro activo
    if ((!courses || courses.length === 0) && page === 1 && !search) {
      return {
        courses: [],
        total: 0,
        currentPage: page,
        totalPages: 1,
      };
    }

    // Aplanar la respuesta para consumo directo en el frontend
    const flattenedCourses = courses.map((cc) => {
      const { CatTipoCurso, CatAreas, ...ccData } = cc;
      return {
        ...ccData,
        nombreTipoCurso: CatTipoCurso?.Descripcion || 'Sin Tipo',
        nombreArea: CatAreas?.Descripcion || 'General / Todas',
      };
    });

    return {
      courses: flattenedCourses,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  // Esta función obtiene los detalles de un curso especifico
  async findOne(companyId: number, courseId: number) {
    // 1. Agregamos await para esperar el resultado de la base de datos
    const course = await this.prismaService.catCursos.findFirst({
      where: {
        idEmpresa: companyId,
        idCursos: courseId,
      },
      include: {
        CatTipoCurso: {
          select: {
            idTipoCurso: true,
            Descripcion: true,
          },
        },
        CatAreas: {
          select: {
            idArea: true,
            Descripcion: true,
          },
        },
      },
    });

    // 2. Si no existe, lanzamos la excepción de NestJS
    if (!course) {
      throw new NotFoundException(
        'Curso no encontrado o no pertenece a la empresa actual',
      );
    }

    // 3. Aplanamos la respuesta exactamente como en findAll
    const { CatTipoCurso, CatAreas, ...ccData } = course;

    return {
      ...ccData,
      nombreTipoCurso: CatTipoCurso?.Descripcion || 'Sin Tipo',
      nombreArea: CatAreas?.Descripcion || 'General / Todas',
    };
  }

  // Esta función cambia el estado de un curso a inactivo o activo
  async changeStatus(companyId: number, courseId: number, active: boolean, user: ActiveUserDto) {
    // Verificamos si el área existe y si tiene presencia en la empresa actual
    const document = await this.prismaService.catCursos.findFirst({
      where: {
        idEmpresa: companyId,
        idCursos: courseId,
      },
    });

    if (!document) {
      throw new Error('Curso no encontrado o no pertenece a la empresa actual');
    }

    // Si pasa las validaciones (o si es una desactivación directa), actualizamos el estatus
    await this.prismaService.catCursos.update({
      where: { idCursos: courseId },
      data: {
        activo: active
      },
    });

    // Registrar el movimiento en el histórico
    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'VALIDAR',
        tablaOrigen: 'CatCursos',
        idRegistro: String(courseId),
        descripcion: `Curso ${active ? 'activado' : 'desactivado'} por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date()
      }
    });

    return {
      message: !active ? 'Curso desactivado correctamente' : 'Curso activado correctamente'
    };
  }

  // Esta función actualiza un curso existente
  async update(companyId: number, courseId: number, updateCourseDto: UpdateCourseDto, user: ActiveUserDto) {
    // Verificamos si el curso existe y si tiene presencia en la empresa actual
    const existingCourse = await this.prismaService.catCursos.findFirst({
      where: {
        idEmpresa: companyId,
        idCursos: courseId,
      },
    });

    if (!existingCourse) {
      throw new Error('Curso no encontrado o no pertenece a la empresa actual');
    }

    // Actualizamos el curso
    const updatedCourse = await this.prismaService.catCursos.update({
      where: { idCursos: courseId },
      data: {
        Descripcion: updateCourseDto.Descripcion,
        idArea: updateCourseDto.idArea,
        idTipoCurso: updateCourseDto.idTipoCurso,
      },
    });

    // Registrar el movimiento en el histórico
    await this.prismaService.historicoMovimientos.create({
      data: {
        idUsuario: user.id,
        idEmpresa: companyId,
        accion: 'UPDATE',
        tablaOrigen: 'CatCursos',
        idRegistro: String(courseId),
        descripcion: `Curso "${updateCourseDto.Descripcion}" actualizado por ${user.first_name} ${user.last_name}`,
        fechaCreacion: new Date()
      }
    });

    return updatedCourse;
  }

  async createSession(companyId: number, createCourseSessionDto: CreateCourseSessionDto, user: ActiveUserDto,) {
    const {
      idCurso, modalidad, tipoInstructor, idEmpleadoInstructor, nombreInstructorExterno,
      empresaInstructorExterno, fechaInicioPeriodo, fechaFinPeriodo, ubicacionFisica,
      linkReunion, minutosToleranciaQr, porcentajeAsistenciaMinimo, fechasClase,
    } = createCourseSessionDto;

    // 1. Verificamos que el curso base exista en el catálogo de la empresa
    const baseCourse = await this.prismaService.catCursos.findFirst({
      where: {
        idCursos: idCurso,
        idEmpresa: companyId,
      },
    });

    if (!baseCourse) {
      throw new NotFoundException(
        `El curso base con ID ${idCurso} no existe o no pertenece a la empresa actual.`,
      );
    }

    // 2. Ejecutamos la inserción relacional y el histórico en una sola Transacción
    return await this.prismaService.$transaction(async (tx) => {
      // A. Crear la Sesión Principal
      const newSession = await tx.cursoSesiones.create({
        data: {
          idCurso,
          idEmpresa: companyId,
          modalidad,
          tipoInstructor,
          idEmpleadoInstructor:
            tipoInstructor === 'interno' ? idEmpleadoInstructor : null,
          nombreInstructorExterno:
            tipoInstructor === 'externo' && nombreInstructorExterno?.trim() !== ''
              ? nombreInstructorExterno
              : null,
          empresaInstructorExterno:
            tipoInstructor === 'externo' && empresaInstructorExterno?.trim() !== ''
              ? empresaInstructorExterno
              : null,
          fechaInicioPeriodo: new Date(fechaInicioPeriodo),
          fechaFinPeriodo: new Date(fechaFinPeriodo),
          ubicacionFisica:
            modalidad === 'presencial' && ubicacionFisica?.trim() !== ''
              ? ubicacionFisica
              : null,
          linkReunion:
            modalidad === 'online_sincrono' && linkReunion?.trim() !== ''
              ? linkReunion
              : null,
          minutosToleranciaQr: minutosToleranciaQr ?? 15,
          porcentajeAsistenciaMinimo: porcentajeAsistenciaMinimo ?? 80,
          estatus: 'programado',
        },
      });

      // B. Crear las fechas de clase multidía (asociadas a la sesión recién creada)
      if (fechasClase && fechasClase.length > 0) {
        await tx.cursoFechasClase.createMany({
          data: fechasClase.map((fecha) => ({
            idSesion: newSession.idSesion,
            tituloClase: fecha.tituloClase,
            fechaHoraInicio: new Date(fecha.fechaHoraInicio),
            fechaHoraFin: new Date(fecha.fechaHoraFin),
            estatus: 'programada',
          })),
        });
      }

      // C. Registrar en el Histórico de Movimientos
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'CREATE',
          tablaOrigen: 'CursoSesiones',
          idRegistro: String(newSession.idSesion),
          descripcion: `Sesión para el curso "${baseCourse.Descripcion}" programada por ${user.first_name} ${user.last_name}`,
          fechaCreacion: new Date(),
        },
      });

      // D. Retornar la sesión creada junto a sus fechas registradas
      const createdFechas = await tx.cursoFechasClase.findMany({
        where: { idSesion: newSession.idSesion },
      });

      return {
        ...newSession,
        fechasClase: createdFechas,
      };
    });
  }

  // Esta función obtiene todas las sesiones programadas de un curso en específico con paginación
  async findSessionsByCourse(companyId: number, courseId: number, page: number, limit: number, search: string) {
    const skip = (page - 1) * limit;

    // 1. Verificamos que el curso pertenezca a la empresa actual
    const baseCourse = await this.prismaService.catCursos.findFirst({
      where: {
        idCursos: courseId,
        idEmpresa: companyId,
      },
    });

    if (!baseCourse) {
      throw new NotFoundException(
        `El curso con ID ${courseId} no fue encontrado o no pertenece a la empresa actual`,
      );
    }

    // 2. Condición base de búsqueda
    const whereCondition: any = {
      idEmpresa: companyId,
      idCurso: courseId,
    };

    // 3. Aplicar filtro de búsqueda si existe
    if (search) {
      whereCondition.OR = [
        { ubicacionFisica: { contains: search } },
        { linkReunion: { contains: search } },
        { nombreInstructorExterno: { contains: search } },
        { empresaInstructorExterno: { contains: search } },
        {
          Empleados: {
            OR: [
              { nombre: { contains: search } },
              { primerApellido: { contains: search } },
              { segundoApellido: { contains: search } },
            ],
          },
        },
      ];
    }

    // 4. Consulta en paralelo (Sesiones + Conteos)
    const [sessions, total] = await Promise.all([
      this.prismaService.cursoSesiones.findMany({
        where: whereCondition,
        include: {
          CatCursos: {
            select: {
              Descripcion: true,
            },
          },
          Empleados: {
            select: {
              idEmpleado: true,
              nombre: true,
              primerApellido: true,
              segundoApellido: true,
            },
          },
          CursoFechasClase: {
            select: {
              idFechaClase: true,
              tituloClase: true,
              fechaHoraInicio: true,
              fechaHoraFin: true,
              estatus: true,
            },
            orderBy: { fechaHoraInicio: 'asc' },
          },
          _count: {
            select: {
              CursoParticipantes: true, // Retorna la cantidad total de inscritos
            },
          },
        },
        skip: skip,
        take: limit,
        orderBy: { idSesion: 'desc' },
      }),
      this.prismaService.cursoSesiones.count({ where: whereCondition }),
    ]);

    // 5. Caso borde: Sin resultados en la primera página
    if ((!sessions || sessions.length === 0) && page === 1 && !search) {
      return {
        sessions: [],
        total: 0,
        currentPage: page,
        totalPages: 1,
      };
    }

    // 6. Formatear la respuesta
    const formattedSessions = sessions.map((session) => {
      const { Empleados, _count, CatCursos, ...sessionData } = session;

      let nombreInstructor = '';
      if (session.tipoInstructor === 'interno' && Empleados) {
        nombreInstructor = `${Empleados.nombre} ${Empleados.primerApellido} ${Empleados.segundoApellido || ''}`.trim();
      } else if (session.tipoInstructor === 'externo') {
        nombreInstructor = session.nombreInstructorExterno || 'Instructor Externo';
      }

      return {
        ...sessionData,
        nombreCurso: CatCursos.Descripcion,
        nombreInstructor,
        totAsistentes: _count.CursoParticipantes,
      };
    });

    return {
      sessions: formattedSessions,
      total,
      currentPage: page,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async deleteSession(companyId: number, sessionId: number, user: ActiveUserDto) {
    // 1. Verificamos que la sesión exista y pertenezca a la empresa actual
    const session = await this.prismaService.cursoSesiones.findFirst({
      where: {
        idSesion: sessionId,
        idEmpresa: companyId,
      },
      include: {
        CatCursos: {
          select: {
            Descripcion: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `La sesión #${sessionId} no fue encontrada o no pertenece a la empresa actual.`,
      );
    }

    // 2. Regla de negocio: Solo se pueden eliminar sesiones con estatus 'programado'
    if (session.estatus !== 'programado') {
      throw new BadRequestException(
        `No es posible eliminar la sesión #${sessionId} porque su estatus actual es "${session.estatus}". Únicamente se pueden eliminar sesiones en estatus "programado".`,
      );
    }

    // 3. Ejecutamos la eliminación en una Transacción Atómica
    return await this.prismaService.$transaction(async (tx) => {
      // A. Eliminar participantes de la sesión (por respaldo explícito)
      await tx.cursoParticipantes.deleteMany({
        where: { idSesion: sessionId },
      });

      // B. Eliminar las fechas/días de clase asociados
      await tx.cursoFechasClase.deleteMany({
        where: { idSesion: sessionId },
      });

      // C. Eliminar la sesión principal
      await tx.cursoSesiones.delete({
        where: { idSesion: sessionId },
      });

      // D. Registrar el movimiento en el Histórico de Movimientos
      const cursoNombre = session.CatCursos?.Descripcion || 'Curso';
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'DELETE',
          tablaOrigen: 'CursoSesiones',
          idRegistro: String(sessionId),
          descripcion: `Sesión #${sessionId} del curso "${cursoNombre}" eliminada por ${user.first_name} ${user.last_name}`,
          fechaCreacion: new Date(),
        },
      });

      return {
        message: `La sesión #${sessionId} y sus dependencias han sido eliminadas correctamente.`,
      };
    });
  }

  // Esta función obtiene el detalle de una sesión específica por su idSesion
  async findSessionById(companyId: number, sessionId: number) {
    // 1. Buscamos la sesión con todas sus relaciones necesarias
    const session = await this.prismaService.cursoSesiones.findFirst({
      where: {
        idSesion: sessionId,
        idEmpresa: companyId,
      },
      include: {
        CatCursos: {
          select: {
            idCursos: true,
            Descripcion: true,
            idArea: true,
            idTipoCurso: true,
            CatTipoCurso: {
              select: {
                Descripcion: true,
              },
            },
            CatAreas: {
              select: {
                Descripcion: true,
              },
            },
          },
        },
        Empleados: {
          select: {
            idEmpleado: true,
            nombre: true,
            primerApellido: true,
            segundoApellido: true,
            correo: true,
          },
        },
        CursoFechasClase: {
          select: {
            idFechaClase: true,
            tituloClase: true,
            fechaHoraInicio: true,
            fechaHoraFin: true,
            estatus: true,
          },
          orderBy: { fechaHoraInicio: 'asc' },
        },
        CursoParticipantes: {
          select: {
            idParticipante: true,
            idEmpleado: true,
            estatusAsignacion: true,
            calificacionFinal: true,
            creadoEn: true,
          },
        },
        _count: {
          select: {
            CursoParticipantes: true,
          },
        },
      },
    });

    // 2. Excepción si no se encuentra la sesión o no pertenece a la empresa
    if (!session) {
      throw new NotFoundException(
        `La sesión con ID ${sessionId} no fue encontrada o no pertenece a la empresa actual`,
      );
    }

    // 3. Formateo y aplanado de datos
    const { Empleados, CatCursos, _count, ...sessionData } = session;

    let nombreInstructor = '';
    if (session.tipoInstructor === 'interno' && Empleados) {
      nombreInstructor = `${Empleados.nombre} ${Empleados.primerApellido} ${Empleados.segundoApellido || ''}`.trim();
    } else if (session.tipoInstructor === 'externo') {
      nombreInstructor = session.nombreInstructorExterno || 'Instructor Externo';
    }

    return {
      ...sessionData,
      nombreCurso: CatCursos?.Descripcion || 'Sin Nombre',
      nombreArea: CatCursos?.CatAreas?.Descripcion || 'General / Todas',
      nombreTipoCurso: CatCursos?.CatTipoCurso?.Descripcion || 'Sin Categoría',
      nombreInstructor,
      instructorInfo: Empleados
        ? {
          idEmpleado: Empleados.idEmpleado,
          nombreCompleto: nombreInstructor,
          correo: Empleados.correo,
        }
        : null,
      totAsistentes: _count.CursoParticipantes,
    };
  }

  // Esta función sincroniza/guarda los participantes inscritos en una sesión
  async assignParticipants(companyId: number, sessionId: number, assignParticipantsDto: AssignParticipantsDto, user: ActiveUserDto,) {
    const { empleadosIds } = assignParticipantsDto;

    // 1. Verificamos la existencia de la sesión y empresa
    const session = await this.prismaService.cursoSesiones.findFirst({
      where: {
        idSesion: sessionId,
        idEmpresa: companyId,
      },
      include: {
        CatCursos: { select: { Descripcion: true } },
      },
    });

    if (!session) {
      throw new NotFoundException(
        `La sesión #${sessionId} no existe o no pertenece a la empresa.`,
      );
    }

    // 2. Transacción para sincronizar inscritos
    return await this.prismaService.$transaction(async (tx) => {
      // A. Obtenemos participantes actualmente registrados
      const currentParticipants = await tx.cursoParticipantes.findMany({
        where: { idSesion: sessionId },
        select: { idEmpleado: true },
      });

      const currentIds = currentParticipants.map((p) => p.idEmpleado);

      // B. Determinar nuevos a insertar y eliminados a quitar
      const idsToInsert = empleadosIds.filter((id) => !currentIds.includes(id));
      const idsToDelete = currentIds.filter((id) => !empleadosIds.includes(id));

      // C. Eliminar a los que fueron removidos de la tabla local
      if (idsToDelete.length > 0) {
        await tx.cursoParticipantes.deleteMany({
          where: {
            idSesion: sessionId,
            idEmpleado: { in: idsToDelete },
          },
        });
      }

      // D. Insertar nuevos participantes
      if (idsToInsert.length > 0) {
        await tx.cursoParticipantes.createMany({
          data: idsToInsert.map((idEmp) => ({
            idSesion: sessionId,
            idEmpleado: idEmp,
            estatusAsignacion: 'inscrito',
          })),
        });
      }

      // E. Registrar movimiento en Histórico
      await tx.historicoMovimientos.create({
        data: {
          idUsuario: user.id,
          idEmpresa: companyId,
          accion: 'UPDATE',
          tablaOrigen: 'CursoParticipantes',
          idRegistro: String(sessionId),
          descripcion: `Inscripción actualizada para la sesión #${sessionId} (${empleadosIds.length} participantes total) por ${user.first_name} ${user.last_name}`,
          fechaCreacion: new Date(),
        },
      });

      return {
        message: 'Participantes guardados exitosamente',
        totalInscritos: empleadosIds.length,
      };
    });
  }

  async generateQrTokenByClassId(companyId: number, classId: number) {
    // Validar que la clase exista y pertenezca a la empresa
    const clase = await this.prismaService.cursoFechasClase.findFirst({
      where: {
        idFechaClase: classId,
        CursoSesiones: {
          idEmpresa: companyId,
        },
      },
    });

    if (!clase) {
      throw new NotFoundException('La fecha de clase especificada no existe.');
    }

    // Obtener obligatoriamente la URL base del Frontend mediante ConfigService
    const baseUrl = this.configService.getOrThrow<string>('FRONT_URL');

    // Cifrar el ID de la clase para exponerlo de forma segura en la URL
    const encryptedClassId = this.cryptoService.encrypt(String(classId));

    // 4. Construir la URL estructurada en inglés
    // Estructura: https://domain.com/training/attendance/class/:encryptedClassId
    const qrUrl = `${baseUrl}attendance/class/${encodeURIComponent(encryptedClassId)}`;

    return {
      message: 'URL de QR de asistencia generada correctamente',
      data: {
        qrUrl,
        classId: encryptedClassId,
        fechaHoraInicio: clase.fechaHoraInicio,
        fechaHoraFin: clase.fechaHoraFin,
      },
    };
  }

  async getAttendanceInfo(encryptedClassId: string) {
    // 1. Descifrar ID de la clase
    const classId = this.cryptoService.decrypt(encryptedClassId);
    if (!classId) {
      throw new NotFoundException('Identificador de clase inválido.');
    }

    // 2. Consultar clase y sus detalles
    const clase = await this.prismaService.cursoFechasClase.findUnique({
      where: { idFechaClase: Number(classId) },
      include: {
        CursoAsistencias: true,
        CursoSesiones: {
          include: {
            CatCursos: true,
            CursoParticipantes: true,
          },
        },
      },
    });

    if (!clase) {
      throw new NotFoundException('La clase especificada no existe.');
    }

    // Extraer los IDs de empleados que ya registraron su asistencia hoy
    const attendedEmployeeIds = new Set(
      clase.CursoAsistencias.map((a) => a.idEmpleado)
    );

    // Obtener los IDs de todos los participantes asignados a la sesión
    const participantIds = clase.CursoSesiones.CursoParticipantes.map((p) => p.idEmpleado);

    // Consultar los datos de los empleados correspondientes
    const empleados = await this.prismaService.empleados.findMany({
      where: {
        idEmpleado: { in: participantIds },
      },
    });

    const empleadosMap = new Map(empleados.map((emp) => [emp.idEmpleado, emp]));

    // Filtrar únicamente a los colaboradores que NO han pasado lista
    const participantesPendientes = clase.CursoSesiones.CursoParticipantes
      .filter((p) => !attendedEmployeeIds.has(p.idEmpleado))
      .map((p) => {
        const emp = empleadosMap.get(p.idEmpleado);
        return {
          idEmpleado: p.idEmpleado,
          nombreCompleto: emp
            ? `${emp.nombre} ${emp.primerApellido} ${emp.segundoApellido || ''}`.trim()
            : `Empleado #${p.idEmpleado}`,
          numeroEmpleado: emp?.idEmpleado || null,
          asistio: false,
        };
      });

    const now = new Date();
    const startTime = new Date(clase.fechaHoraInicio);
    const endTime = new Date(clase.fechaHoraFin);

    // Margen de tolerancia (15 minutos antes por defecto o la tolerancia configurada en la sesión)
    const toleranceMinutes = clase.CursoSesiones.minutosToleranciaQr || 15;
    const allowedStartTime = new Date(startTime.getTime() - toleranceMinutes * 60000);

    let status: 'active' | 'not_started' | 'finished' = 'active';
    let message = 'Pase de lista abierto.';

    if (now < allowedStartTime) {
      status = 'not_started';
      message = `El pase de lista estará disponible ${toleranceMinutes} minutos antes del inicio (${startTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}).`;
    } else if (now > endTime) {
      status = 'finished';
      message = `La clase finalizó a las ${endTime.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}.`;
    }

    return {
      status,
      message,
      curso: {
        nombreCurso: clase.CursoSesiones.CatCursos.Descripcion,
        tituloClase: clase.tituloClase,
        fechaHoraInicio: clase.fechaHoraInicio,
        fechaHoraFin: clase.fechaHoraFin,
        ubicacionFisica: clase.CursoSesiones.ubicacionFisica,
      },
      participantesPendientes,
    };
  }

  async registerAttendance(data: RegisterAttendanceDto) {
    const { classId, idEmpleado } = data;

    // Limpiar caracteres codificados de la URL (%3A -> :)
    const cleanClassId = decodeURIComponent(classId);
    // Desencriptar la cadena limpia

    const decryptedClassId = this.cryptoService.decrypt(cleanClassId);
    if (!decryptedClassId) {
      throw new BadRequestException('Identificador de clase inválido.');
    }

    const clase = await this.prismaService.cursoFechasClase.findUnique({
      where: { idFechaClase: Number(decryptedClassId) },
    });

    if (!clase) {
      throw new NotFoundException('Clase no encontrada.');
    }

    // Registrar o actualizar el registro de asistencia usando el índice compuesto de Prisma
    await this.prismaService.cursoAsistencias.upsert({
      where: {
        idFechaClase_idEmpleado: {
          idFechaClase: Number(decryptedClassId),
          idEmpleado: Number(idEmpleado),
        },
      },
      update: {
        fechaHoraRegistro: new Date(),
        metodoRegistro: 'qr_autoatendido',
      },
      create: {
        idFechaClase: Number(decryptedClassId),
        idEmpleado: Number(idEmpleado),
        fechaHoraRegistro: new Date(),
        metodoRegistro: 'qr_autoatendido',
      },
    });

    return {
      success: true,
      message: 'Asistencia registrada exitosamente.',
    };
  }

}