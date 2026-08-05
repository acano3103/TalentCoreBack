import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { Logger } from '@nestjs/common';
import { ActiveUserDto } from '../auth/dto/active-user.dto';

@Injectable()
export class CoursesService {
  private readonly logger = new Logger(CoursesService.name);

  constructor(private prismaService: PrismaService) { }

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

}
